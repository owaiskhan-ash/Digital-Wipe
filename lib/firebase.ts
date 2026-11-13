import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDocFromServer,
  type Firestore,
} from "firebase/firestore";
import firebaseConfig from "@/firebase-applet-config.json";

// Initialize Firebase App singleton safely (even if named apps exist first)
const app =
  getApps().find((existing) => existing.name === "[DEFAULT]") ??
  initializeApp(firebaseConfig);

// Secondary isolated app instance dedicated to Phone OTP ownership checks so
// verifying a phone number never replaces the user's primary Google session.
const phoneApp =
  getApps().find((existing) => existing.name === "phone-verify") ??
  initializeApp(firebaseConfig, "phone-verify");

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
const firestoreDatabaseId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  "ai-studio-digitalwipe-70381357-2135-48e4-8de0-95bd491f83bd";
export const db: Firestore = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);
export const phoneAuth = getAuth(phoneApp);

// In-memory access token cache for Google Workspace APIs (never stored in localStorage).
// Google access tokens live about an hour, so the cache carries its own deadline
// rather than handing out a token that the Gmail API will reject with a 401.
const TOKEN_TTL_MS = 50 * 60 * 1000;
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export function getCachedAccessToken(): string | null {
  if (!cachedAccessToken) return null;
  if (Date.now() >= cachedAccessToken.expiresAt) {
    cachedAccessToken = null;
    return null;
  }
  return cachedAccessToken.token;
}

export function setCachedAccessToken(token: string | null) {
  cachedAccessToken = token ? { token, expiresAt: Date.now() + TOKEN_TTL_MS } : null;
}

export function clearGmailToken() {
  cachedAccessToken = null;
}

/** Thrown when Google is still redirecting back; the caller just explains it. */
export class RedirectInProgress extends Error {
  constructor() {
    super(
      "Google is asking for permission to send from your account. The page will reload in a moment, then press Send again."
    );
    this.name = "RedirectInProgress";
  }
}

/**
 * Only redirect when the browser actually cannot open a popup (blocked or
 * unsupported environment) AND we are not inside an iframe (Google blocks
 * accounts.google.com inside iframes via X-Frame-Options: DENY).
 */
function shouldFallbackToRedirect(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? "";
  if (
    code !== "auth/popup-blocked" &&
    code !== "auth/operation-not-supported-in-this-environment"
  ) {
    return false;
  }
  if (typeof window !== "undefined") {
    try {
      if (window.self !== window.top) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export function friendlyGoogleAuthError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  const rawMessage = err instanceof Error ? err.message : String(err ?? "");
  const host = typeof window !== "undefined" ? window.location.hostname : "this domain";

  switch (code) {
    case "auth/unauthorized-domain":
      return `Firebase blocked sign-in because "${host}" is not in Authorized domains (auth/unauthorized-domain).`;
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in popup. Please allow popups for this site or open this page in a new tab and click Sign in again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "The Google sign-in popup was closed before finishing. Click Sign in again to complete login.";
    case "auth/operation-not-allowed":
      return "Google sign-in is disabled in Firebase Console → Authentication → Sign-in method.";
    case "auth/network-request-failed":
      return "Could not reach Google Authentication. Check your internet connection and try again.";
    case "auth/internal-error":
      return "Google sign-in encountered a browser restriction (third-party cookies or popup blocked). Try opening the site directly in a new tab.";
    default:
      if (/unauthorized-domain/i.test(rawMessage)) {
        return `Firebase blocked sign-in because "${host}" is not in Authorized domains (auth/unauthorized-domain).`;
      }
      return rawMessage || "Sign in failed. Please try again.";
  }
}

// Basic provider for 1-click website login (only openid, email, profile, avoids 403 on initial login)
export const basicGoogleProvider = new GoogleAuthProvider();
basicGoogleProvider.setCustomParameters({ prompt: "select_account" });

// Incremental provider for Gmail API sending (requests gmail.send only when sending via Gmail API)
export const gmailGoogleProvider = new GoogleAuthProvider();
gmailGoogleProvider.setCustomParameters({ prompt: "consent select_account" });
gmailGoogleProvider.addScope("https://www.googleapis.com/auth/gmail.send");

export async function signInWithGoogle(
  includeGmailScope = false
): Promise<{ user: User | null; accessToken: string | null; redirecting: boolean }> {
  const provider = includeGmailScope ? gmailGoogleProvider : basicGoogleProvider;

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken ?? null;
    if (token) {
      setCachedAccessToken(token);
    }
    return { user: result.user, accessToken: token, redirecting: false };
  } catch (err) {
    if (!shouldFallbackToRedirect(err)) throw err;
    await signInWithRedirect(auth, provider);
    return { user: null, accessToken: null, redirecting: true };
  }
}

/**
 * Completes a redirect sign-in. Called once when the app starts so both
 * basic login and Gmail token from the round trip are restored cleanly.
 */
export async function consumeRedirectResult(): Promise<{
  user: User | null;
  accessToken: string | null;
}> {
  const result = await getRedirectResult(auth);
  if (!result) return { user: null, accessToken: null };

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken ?? null;
  if (token) {
    setCachedAccessToken(token);
  }
  return { user: result.user, accessToken: token };
}

export async function signOutUser() {
  setCachedAccessToken(null);
  return await signOut(auth);
}

export async function ensureGmailToken(): Promise<string> {
  const cached = getCachedAccessToken();
  if (cached) return cached;

  // A redirect sign-in may have completed on the way into this page.
  const fromRedirect = await consumeRedirectResult();
  if (fromRedirect.accessToken) return fromRedirect.accessToken;

  // Ask for the send scope at the moment of sending, not at sign-in.
  const { accessToken, user, redirecting } = await signInWithGoogle(true);
  if (redirecting) {
    throw new RedirectInProgress();
  }
  if (!accessToken) {
    throw new Error("Google did not grant Gmail send permission. Please try again and allow Gmail access.");
  }
  if (!user) {
    throw new Error("Google did not return an account. Please sign in again.");
  }
  return accessToken;
}

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

export function normalizeToE164(
  rawPhone: string,
  defaultCountryCode = "+91"
): string | null {
  const trimmed = rawPhone.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;

  if (trimmed.startsWith("+")) {
    return `+${digits}`;
  }
  if (trimmed.startsWith("00") && digits.length > 9) {
    return `+${digits.slice(2)}`;
  }

  const cleanLocal = digits.replace(/^0+/, "");
  if (!cleanLocal) return null;

  const ccDigits = defaultCountryCode.replace(/\D/g, "") || "91";
  // If the user already typed the country code without "+", avoid double-prefixing
  if (cleanLocal.length > 10 && cleanLocal.startsWith(ccDigits)) {
    return `+${cleanLocal}`;
  }
  return `+${ccDigits}${cleanLocal}`;
}

export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  const da = a.replace(/\D/g, "").replace(/^0+/, "");
  const db = b.replace(/\D/g, "").replace(/^0+/, "");
  if (!da || !db) return false;
  if (da === db) return true;
  // Allow matching a 10-digit local input against a verified E.164 number with country code
  if (da.length === 10 && db.length > 10 && db.endsWith(da)) return true;
  if (db.length === 10 && da.length > 10 && da.endsWith(db)) return true;
  return false;
}

export function friendlyPhoneAuthError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  const host = typeof window !== "undefined" ? window.location.hostname : "this domain";

  switch (code) {
    case "auth/unauthorized-domain":
      return `Add "${host}" to Firebase Console → Authentication → Settings → Authorized domains, then retry.`;
    case "auth/captcha-check-failed":
    case "auth/invalid-app-credential":
      return `reCAPTCHA verification failed for "${host}". Confirm "${host}" is listed under Firebase Console → Authentication → Settings → Authorized domains.`;
    case "auth/operation-not-allowed":
      if (/region/i.test(message)) {
        return "Firebase SMS Region Policy is blocking this country. Open Firebase Console → Authentication → Settings → SMS region policy, allow India (+91) (or your country), and click Save.";
      }
      return "Phone sign-in is disabled in Firebase Console → Authentication → Sign-in method → Phone, or SMS region policy is blocking this country under Authentication → Settings → SMS region policy.";
    case "auth/billing-not-enabled":
    case "auth/quota-exceeded":
      return "SMS quota or Blaze billing is required by Firebase to send live SMS, or add your number under Firebase Console → Authentication → Phone → Phone numbers for testing.";
    case "auth/invalid-phone-number":
      return "Please enter a valid phone number with country code (for example, +91 9819708112).";
    case "auth/missing-phone-number":
      return "Please enter a phone number first.";
    case "auth/invalid-verification-code":
      return "That 6-digit OTP code does not match. Check the SMS and try again.";
    case "auth/code-expired":
      return "That OTP code has expired. Request a new code and try again.";
    case "auth/too-many-requests":
      return "Too many SMS attempts from this device or number. Wait a few minutes before requesting another OTP.";
    default:
      if (/unauthorized-domain/i.test(message)) {
        return `Add "${host}" to Firebase Console → Authentication → Settings → Authorized domains, then retry.`;
      }
      return message || "Could not verify your phone number. Please try again.";
  }
}

declare global {
  interface Window {
    grecaptcha?: {
      reset: (widgetId?: number) => void;
    };
  }
}

export function createPhoneRecaptchaVerifier(
  containerEl: HTMLElement,
  options?: {
    size?: "invisible" | "normal";
    onSolved?: () => void;
    onExpired?: () => void;
  }
): RecaptchaVerifier {
  phoneAuth.useDeviceLanguage();
  containerEl.innerHTML = "";
  const slot = document.createElement("div");
  containerEl.appendChild(slot);
  return new RecaptchaVerifier(phoneAuth, slot, {
    size: options?.size ?? "invisible",
    callback: () => {
      options?.onSolved?.();
    },
    "expired-callback": () => {
      options?.onExpired?.();
    },
  });
}

export async function sendPhoneOtp(
  e164Phone: string,
  verifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
  let widgetId: number | undefined;
  try {
    widgetId = await verifier.render();
  } catch {
    // If render throws before signInWithPhoneNumber, let signInWithPhoneNumber surface exact error
  }

  try {
    return await signInWithPhoneNumber(phoneAuth, e164Phone, verifier);
  } catch (err) {
    if (typeof window !== "undefined" && typeof widgetId === "number") {
      try {
        window.grecaptcha?.reset(widgetId);
      } catch {
        // ignore reset errors
      }
    }
    throw err;
  }
}

export async function confirmPhoneOtp(
  confirmation: ConfirmationResult,
  otpCode: string
): Promise<{ phoneNumber: string; token: string }> {
  const credential = await confirmation.confirm(otpCode.trim());
  const token = await credential.user.getIdToken(true);
  const verifiedPhone = credential.user.phoneNumber;
  if (!verifiedPhone) {
    throw new Error("Firebase did not return a verified phone number.");
  }
  return { phoneNumber: verifiedPhone, token };
}

export async function getVerifiedPhoneToken(): Promise<{
  phoneNumber: string | null;
  token: string | null;
}> {
  const current = phoneAuth.currentUser;
  if (!current?.phoneNumber) {
    return { phoneNumber: null, token: null };
  }
  try {
    const token = await current.getIdToken();
    return { phoneNumber: current.phoneNumber, token };
  } catch {
    return { phoneNumber: null, token: null };
  }
}

export async function clearPhoneVerification(): Promise<void> {
  await signOut(phoneAuth).catch(() => {});
}
