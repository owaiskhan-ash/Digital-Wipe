import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDocFromServer,
  type Firestore,
} from "firebase/firestore";
import firebaseConfig from "@/firebase-applet-config.json";

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
const firestoreDatabaseId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  "ai-studio-digitalwipe-70381357-2135-48e4-8de0-95bd491f83bd";
export const db: Firestore = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);

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
 * Popups are refused by most mobile browsers and by many desktop ones after the
 * first one. When that happens the provider falls back to a full redirect, which
 * finishes on the way back in through consumeRedirectResult().
 */
function isPopupUnavailable(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? "";
  return [
    "auth/popup-blocked",
    "auth/popup-closed-by-user",
    "auth/cancelled-popup-request",
    "auth/operation-not-supported-in-this-environment",
  ].includes(code);
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
): Promise<{ user: User | null; accessToken: string | null }> {
  const provider = includeGmailScope ? gmailGoogleProvider : basicGoogleProvider;

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken ?? null;
    if (token) {
      setCachedAccessToken(token);
    }
    return { user: result.user, accessToken: token };
  } catch (err) {
    if (!isPopupUnavailable(err)) throw err;
    await signInWithRedirect(auth, provider);
    return { user: null, accessToken: null };
  }
}

/**
 * Completes a redirect sign-in. Called once when the app starts so the Gmail
 * token from the round trip is already cached when the user presses Send.
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
  const { accessToken, user } = await signInWithGoogle(true);
  if (!accessToken) {
    // Either the browser redirected (it is already navigating away) or Google
    // returned a session without an access token.
    throw new RedirectInProgress();
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
