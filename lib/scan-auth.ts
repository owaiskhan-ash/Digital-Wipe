import { createPublicKey, verify as verifySignature } from "node:crypto";
import firebaseConfig from "@/firebase-applet-config.json";

/**
 * Who is asking for a scan.
 *
 * The scan is the one action that spends money and queries the open web on
 * someone's behalf, so it is tied to a signed-in Google account here as well as
 * in the interface. Additionally, any Phone Number Scan requires a valid
 * Firebase Phone Auth OTP ID token whose verified `phone_number` claim matches
 * the phone number being searched.
 */

export type ScanCaller = { uid: string; email?: string; phoneNumber?: string };

export type ScanAuthResult =
  | { ok: true; caller: ScanCaller }
  | { ok: false; reason: "missing" | "invalid" | "unavailable" };

export type PhoneOwnershipResult =
  | { ok: true; phoneNumber: string }
  | { ok: false; status: 401 | 403; code: string; error: string };

const LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const JWK_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const PROJECT_ID = firebaseConfig.projectId;

type JwkKey = {
  kid: string;
  kty: string;
  alg?: string;
  n?: string;
  e?: string;
  use?: string;
};

let cachedJwks: { keys: JwkKey[]; expiresAt: number } | null = null;

async function fetchSecureTokenJwks(): Promise<JwkKey[]> {
  if (cachedJwks && Date.now() < cachedJwks.expiresAt) {
    return cachedJwks.keys;
  }

  const res = await fetch(JWK_URL, {
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to load Firebase JWKs (${res.status})`);
  }

  const cacheControl = res.headers.get("cache-control") ?? "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlMs = maxAgeMatch ? Math.min(3600, Number(maxAgeMatch[1])) * 1000 : 15 * 60 * 1000;

  const data = (await res.json()) as { keys?: JwkKey[] };
  const keys = data.keys ?? [];
  if (keys.length > 0) {
    cachedJwks = { keys, expiresAt: Date.now() + ttlMs };
  }
  return keys;
}

function decodeJwtPart(segment: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(segment, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function readClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  return decodeJwtPart(parts[1]);
}

/** Is this plausibly a live ID token issued by this Firebase project? */
function looksLikeOurToken(token: string): boolean {
  const claims = readClaims(token);
  if (!claims) return false;
  const expiry = typeof claims.exp === "number" ? claims.exp : 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const iat = typeof claims.iat === "number" ? claims.iat : 0;
  return (
    claims.aud === PROJECT_ID &&
    claims.iss === `https://securetoken.google.com/${PROJECT_ID}` &&
    typeof claims.sub === "string" &&
    claims.sub.length > 0 &&
    iat <= nowSec + 300 &&
    expiry > nowSec
  );
}

async function verifyJwtSignature(token: string): Promise<Record<string, unknown> | null> {
  if (!looksLikeOurToken(token)) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (!header || !claims) return null;
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;

  const keys = await fetchSecureTokenJwks();
  const matched = keys.find((k) => k.kid === header.kid);
  if (!matched) return null;

  const publicKey = createPublicKey({ key: matched as unknown as JsonWebKey, format: "jwk" });
  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, "utf8");
  const signature = Buffer.from(parts[2], "base64url");
  const valid = verifySignature("RSA-SHA256", signingInput, publicKey, signature);
  return valid ? claims : null;
}

function phoneDigitsMatch(verifiedPhone: string, requestedPhone: string): boolean {
  const vDigits = verifiedPhone.replace(/\D/g, "").replace(/^0+/, "");
  const rDigits = requestedPhone.replace(/\D/g, "").replace(/^0+/, "");
  if (!vDigits || !rDigits) return false;
  if (vDigits === rDigits) return true;
  // Allow plain 10-digit local input when the user verified that exact number with country code
  if (rDigits.length === 10 && vDigits.length > 10 && vDigits.endsWith(rDigits)) {
    return true;
  }
  return false;
}

export async function verifyScanCaller(request: Request): Promise<ScanAuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (!token) return { ok: false, reason: "missing" };
  if (!looksLikeOurToken(token)) return { ok: false, reason: "invalid" };

  try {
    const response = await fetch(`${LOOKUP_URL}?key=${firebaseConfig.apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });

    // 400 from Identity Toolkit means it does not recognise the token.
    if (!response.ok) return { ok: false, reason: "invalid" };

    const data = (await response.json()) as {
      users?: Array<{ localId?: string; email?: string; phoneNumber?: string }>;
    };
    const account = data.users?.[0];
    if (!account?.localId) return { ok: false, reason: "invalid" };

    return {
      ok: true,
      caller: {
        uid: account.localId,
        email: account.email,
        phoneNumber: account.phoneNumber,
      },
    };
  } catch {
    // Fallback to offline-capable cryptographic RS256 JWK verification
    try {
      const verifiedClaims = await verifyJwtSignature(token);
      if (!verifiedClaims) return { ok: false, reason: "unavailable" };
      return {
        ok: true,
        caller: {
          uid: String(verifiedClaims.sub ?? ""),
          email: verifiedClaims.email as string | undefined,
          phoneNumber: verifiedClaims.phone_number as string | undefined,
        },
      };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }
}

/**
 * Verifies that a Phone Number Scan request carries a genuine Firebase Phone Auth
 * OTP token issued for the exact phone number being searched.
 */
export async function verifyPhoneOwnershipToken(
  request: Request,
  targetPhone: string
): Promise<PhoneOwnershipResult> {
  const token = (request.headers.get("x-phone-auth-token") ?? "").trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "phone-otp-required",
      error: "Please verify ownership of this phone number via SMS OTP before scanning it.",
    };
  }

  if (!looksLikeOurToken(token)) {
    return {
      ok: false,
      status: 401,
      code: "phone-otp-invalid",
      error: "Your phone OTP verification has expired or is invalid. Please re-verify via SMS OTP.",
    };
  }

  let verifiedPhone: string | undefined;

  try {
    const response = await fetch(`${LOOKUP_URL}?key=${firebaseConfig.apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        status: 401,
        code: "phone-otp-invalid",
        error: "Phone OTP verification failed or expired. Please verify the number via SMS OTP again.",
      };
    }

    const data = (await response.json()) as {
      users?: Array<{ localId?: string; phoneNumber?: string }>;
    };
    verifiedPhone = data.users?.[0]?.phoneNumber;
  } catch {
    try {
      const claims = await verifyJwtSignature(token);
      verifiedPhone =
        typeof claims?.phone_number === "string" ? claims.phone_number : undefined;
    } catch {
      return {
        ok: false,
        status: 401,
        code: "phone-otp-unavailable",
        error: "Could not verify phone OTP token right now. Please try again in a moment.",
      };
    }
  }

  if (!verifiedPhone) {
    return {
      ok: false,
      status: 401,
      code: "phone-otp-missing-number",
      error: "This session does not include a verified phone number. Complete SMS OTP verification first.",
    };
  }

  if (!phoneDigitsMatch(verifiedPhone, targetPhone)) {
    return {
      ok: false,
      status: 403,
      code: "phone-otp-mismatch",
      error: `OTP verification only covers ${verifiedPhone}. Verify ${targetPhone} via SMS OTP to scan it.`,
    };
  }

  return { ok: true, phoneNumber: verifiedPhone };
}

export function scanAuthMessage(reason: "missing" | "invalid" | "unavailable"): string {
  return reason === "unavailable"
    ? "Could not confirm your sign-in just now. Try once more in a moment."
    : "Sign in with Google to run a scan.";
}
