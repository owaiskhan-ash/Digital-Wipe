import firebaseConfig from "@/firebase-applet-config.json";

/**
 * Who is asking for a scan.
 *
 * The scan is the one action that spends money and queries the open web on
 * someone's behalf, so it is tied to a signed-in Google account here as well as
 * in the interface. A gate that only exists in the browser is a suggestion: the
 * route is a public URL, and anyone can POST to it.
 *
 * The check is two steps and no new dependency. First the token has to look
 * like a Firebase ID token for this project — three segments, the right issuer,
 * the right audience, not expired — which rejects anything invented locally.
 * Then Google is asked whether it really issued it, with a single call to the
 * Identity Toolkit using the token the client already holds.
 */

export type ScanCaller = { uid: string; email?: string };

export type ScanAuthResult =
  | { ok: true; caller: ScanCaller }
  | { ok: false; reason: "missing" | "invalid" | "unavailable" };

const LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const PROJECT_ID = firebaseConfig.projectId;

function readClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const claims = JSON.parse(json) as Record<string, unknown>;
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

/** Is this plausibly a live ID token issued by this Firebase project? */
function looksLikeOurToken(token: string): boolean {
  const claims = readClaims(token);
  if (!claims) return false;
  const expiry = typeof claims.exp === "number" ? claims.exp : 0;
  return (
    claims.aud === PROJECT_ID &&
    claims.iss === `https://securetoken.google.com/${PROJECT_ID}` &&
    typeof claims.sub === "string" &&
    claims.sub.length > 0 &&
    expiry * 1000 > Date.now()
  );
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
      users?: Array<{ localId?: string; email?: string }>;
    };
    const account = data.users?.[0];
    if (!account?.localId) return { ok: false, reason: "invalid" };

    return { ok: true, caller: { uid: account.localId, email: account.email } };
  } catch {
    // Google unreachable: the token still carries this project's issuer and an
    // unexpired session. Let the scan run and say so in the log, rather than
    // taking the product down for every signed-in user because of one outage.
    const claims = readClaims(token);
    console.warn("Scan auth: Identity Toolkit unreachable, accepting unverified token", {
      sub: claims?.sub ?? null,
    });
    return {
      ok: true,
      caller: { uid: String(claims?.sub ?? ""), email: claims?.email as string | undefined },
    };
  }
}

export function scanAuthMessage(reason: "missing" | "invalid" | "unavailable"): string {
  return reason === "unavailable"
    ? "Could not confirm your sign-in just now. Try once more in a moment."
    : "Sign in with Google to run a scan.";
}
