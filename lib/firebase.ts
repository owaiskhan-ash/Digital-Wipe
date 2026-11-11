import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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

// In-memory access token cache for Google Workspace APIs (never stored in localStorage)
let cachedAccessToken: string | null = null;

export function getCachedAccessToken(): string | null {
  return cachedAccessToken;
}

export function setCachedAccessToken(token: string | null) {
  cachedAccessToken = token;
}

// Basic provider for 1-click website login (only openid, email, profile — avoids 403 on initial login)
export const basicGoogleProvider = new GoogleAuthProvider();
basicGoogleProvider.setCustomParameters({ prompt: "select_account" });

// Incremental provider for Gmail API sending (requests gmail.send only when sending via Gmail API)
export const gmailGoogleProvider = new GoogleAuthProvider();
gmailGoogleProvider.setCustomParameters({ prompt: "consent select_account" });
gmailGoogleProvider.addScope("https://www.googleapis.com/auth/gmail.send");

export async function signInWithGoogle(
  includeGmailScope = false
): Promise<{ user: User; accessToken: string | null }> {
  const provider = includeGmailScope ? gmailGoogleProvider : basicGoogleProvider;
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken ?? null;
  if (token && includeGmailScope) {
    setCachedAccessToken(token);
  }
  return { user: result.user, accessToken: token };
}

export async function signOutUser() {
  setCachedAccessToken(null);
  return await signOut(auth);
}

export async function ensureGmailToken(): Promise<string> {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }
  // Request Gmail send scope when the user actually sends an email via Gmail API
  const { accessToken } = await signInWithGoogle(true);
  if (!accessToken) {
    throw new Error("Unable to obtain Gmail authorization token. Please sign in again.");
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
