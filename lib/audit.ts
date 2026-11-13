"use client";

import type { User } from "firebase/auth";

/**
 * The two records the admin panel reads: who came in, and what they looked for.
 *
 * Both are written by the signed-in client, never by the server, because the
 * Firestore rules only let a user create a row that carries their own uid. The
 * panel is the one place allowed to read across accounts.
 *
 * Every write here is best effort. A scan that worked should never fail because
 * an audit row could not be written — if the rules have not been published yet,
 * the scan still finishes and the console says why.
 */

const SESSION_KEY_PREFIX = "untrace.session.recorded.";

type LoginVia = "google" | "restore";

// Set when someone presses "Sign in", so the auth listener can label the row
// "google" instead of "restore" for the sign-in it is about to observe.
let explicitSignIn = false;

export function markExplicitSignIn() {
  explicitSignIn = true;
}

type AuditUser = Pick<User, "uid" | "email" | "displayName">;

function sessionKey(uid: string) {
  return `${SESSION_KEY_PREFIX}${uid}`;
}

function alreadyRecorded(uid: string): boolean {
  try {
    return window.sessionStorage.getItem(sessionKey(uid)) === "1";
  } catch {
    return false;
  }
}

function markRecorded(uid: string) {
  try {
    window.sessionStorage.setItem(sessionKey(uid), "1");
  } catch {
    /* storage blocked: the next reload records again, which is harmless */
  }
}

/**
 * One row per browser session, not one per page view. A reload is not a login,
 * and an admin reading the list should not see the same person ten times because
 * they moved between pages.
 */
export async function recordLoginOnce(user: AuditUser): Promise<void> {
  if (alreadyRecorded(user.uid)) return;
  markRecorded(user.uid);

  const via: LoginVia = explicitSignIn ? "google" : "restore";
  explicitSignIn = false;

  try {
    const [{ addDoc, collection }, { db }] = await Promise.all([
      import("firebase/firestore"),
      import("./firebase"),
    ]);

    await addDoc(collection(db, "logins"), {
      uid: user.uid,
      email: (user.email ?? "").slice(0, 256),
      name: (user.displayName ?? "").slice(0, 128),
      at: new Date().toISOString(),
      via,
      ua: (typeof navigator !== "undefined" ? navigator.userAgent : "").slice(0, 200),
    });
  } catch (error) {
    console.warn("Login record not written:", error);
  }
}

export type SearchRecordInput = {
  mode: "phone" | "email";
  query: string;
  findings: number;
  source: "scan" | "dashboard";
};

/** One row per completed scan: what was searched, and what it returned. */
export async function recordSearch(
  user: AuditUser,
  input: SearchRecordInput
): Promise<void> {
  try {
    const [{ addDoc, collection }, { db }] = await Promise.all([
      import("firebase/firestore"),
      import("./firebase"),
    ]);

    await addDoc(collection(db, "searches"), {
      uid: user.uid,
      email: (user.email ?? "").slice(0, 256),
      mode: input.mode,
      query: input.query.slice(0, 128),
      findings: Math.max(0, Math.round(input.findings)),
      at: new Date().toISOString(),
      source: input.source,
    });
  } catch (error) {
    console.warn("Search record not written:", error);
  }
}
