"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "firebase/auth";
import type {
  RemovalRequest,
  RequestStatus,
  ScanResult,
  StoredState,
} from "./types";
import { addDays } from "./utils";

const STORAGE_KEY = "untrace.state.v1";
const AUTH_ACTIVE_KEY = "untrace.auth.active";
const EMPTY: StoredState = { scan: null, requests: [], version: 1 };

type StoreValue = {
  hydrated: boolean;
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  isSyncing: boolean;
  scan: ScanResult | null;
  requests: RemovalRequest[];
  saveScan: (scan: ScanResult) => void;
  saveRequests: (requests: RemovalRequest[]) => void;
  upsertRequest: (request: RemovalRequest) => void;
  setRequestStatus: (id: string, status: RequestStatus) => void;
  removeRequest: (id: string) => void;
  reset: () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
};

const StoreContext = createContext<StoreValue | null>(null);

function readLocal(): StoredState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      scan: parsed.scan ?? null,
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
      version: 1,
    };
  } catch {
    return EMPTY;
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoredState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [firebaseEnabled, setFirebaseEnabled] = useState(false);

  // Initial local state hydration — only load Firebase SDK if user previously signed in
  useEffect(() => {
    setState(readLocal());
    setHydrated(true);
    try {
      if (window.localStorage.getItem(AUTH_ACTIVE_KEY) === "1") {
        setAuthLoading(true);
        setFirebaseEnabled(true);
      }
    } catch {
      /* storage blocked */
    }
  }, []);

  // Save to local storage for offline / quick reload fallback
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked */
    }
  }, [state, hydrated]);

  // Lazy-loaded Firebase Auth & Firestore listener (only runs when firebaseEnabled is true)
  useEffect(() => {
    if (!firebaseEnabled) return;

    let unsubscribeAuth: (() => void) | undefined;
    let unsubscribeRequests: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const [
          { onAuthStateChanged },
          {
            collection,
            doc,
            getDoc,
            getDocs,
            limit,
            onSnapshot,
            orderBy,
            query,
            setDoc,
          },
          fb,
        ] = await Promise.all([
          import("firebase/auth"),
          import("firebase/firestore"),
          import("./firebase"),
        ]);

        if (cancelled) return;

        fb.testConnection().catch((err) => {
          console.warn("Firestore connection check:", err);
        });

        unsubscribeAuth = onAuthStateChanged(fb.auth, async (currentUser) => {
          if (cancelled) return;
          setUser(currentUser);
          setAuthLoading(false);

          if (unsubscribeRequests) {
            unsubscribeRequests();
            unsubscribeRequests = undefined;
          }

          if (!currentUser) {
            fb.setCachedAccessToken(null);
            try {
              window.localStorage.removeItem(AUTH_ACTIVE_KEY);
            } catch {
              /* ignore */
            }
          } else {
            try {
              window.localStorage.setItem(AUTH_ACTIVE_KEY, "1");
            } catch {
              /* ignore */
            }

            setIsSyncing(true);
            const userDocPath = `users/${currentUser.uid}`;
            try {
              const userRef = doc(fb.db, "users", currentUser.uid);
              let existingData: Record<string, unknown> | null = null;
              try {
                const snap = await getDoc(userRef);
                if (snap.exists()) {
                  existingData = snap.data();
                }
              } catch (err) {
                fb.handleFirestoreError(err, fb.OperationType.GET, userDocPath);
              }

              const now = new Date().toISOString();
              const profilePayload = {
                id: currentUser.uid,
                email: currentUser.email || "",
                displayName: (currentUser.displayName || "Untrace User").slice(0, 128),
                photoURL: (currentUser.photoURL || "").slice(0, 512),
                createdAt: (existingData?.createdAt as string) || now,
                updatedAt: now,
              };

              try {
                await setDoc(userRef, profilePayload, { merge: true });
              } catch (err) {
                fb.handleFirestoreError(err, fb.OperationType.WRITE, userDocPath);
              }

              try {
                const scansQuery = query(
                  collection(fb.db, "users", currentUser.uid, "scans"),
                  orderBy("createdAt", "desc"),
                  limit(1)
                );
                const scanSnaps = await getDocs(scansQuery);
                if (!scanSnaps.empty) {
                  const remoteScan = scanSnaps.docs[0].data() as ScanResult;
                  setState((prev) => ({
                    ...prev,
                    scan: remoteScan,
                  }));
                } else {
                  const localCurrent = readLocal();
                  if (localCurrent.scan) {
                    const newScanRef = doc(
                      fb.db,
                      "users",
                      currentUser.uid,
                      "scans",
                      localCurrent.scan.id
                    );
                    await setDoc(newScanRef, {
                      id: localCurrent.scan.id,
                      userId: currentUser.uid,
                      createdAt: localCurrent.scan.createdAt,
                      checked: localCurrent.scan.checked,
                      demo: Boolean(localCurrent.scan.demo),
                      profile: localCurrent.scan.profile,
                      findings: localCurrent.scan.findings,
                      breaches: localCurrent.scan.breaches,
                      ...(localCurrent.scan.swarmReports
                        ? { swarmReports: localCurrent.scan.swarmReports }
                        : {}),
                    });
                  }
                }
              } catch (err) {
                console.warn("Scan cloud sync notice:", err);
              }
            } catch (err) {
              console.error("User initialization error:", err);
            } finally {
              if (!cancelled) setIsSyncing(false);
            }

            // Real-time listener for removal requests
            const reqsPath = `users/${currentUser.uid}/requests`;
            const q = query(
              collection(fb.db, "users", currentUser.uid, "requests"),
              orderBy("createdAt", "desc")
            );
            unsubscribeRequests = onSnapshot(
              q,
              (snapshot) => {
                const cloudRequests: RemovalRequest[] = [];
                snapshot.forEach((docItem) => {
                  cloudRequests.push(docItem.data() as RemovalRequest);
                });
                setState((prev) => ({
                  ...prev,
                  requests: cloudRequests,
                }));
              },
              (error) => {
                fb.handleFirestoreError(error, fb.OperationType.GET, reqsPath);
              }
            );
          }
        });
      } catch (err) {
        console.error("Failed to load Firebase client:", err);
        if (!cancelled) setAuthLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeRequests) unsubscribeRequests();
    };
  }, [firebaseEnabled]);

  // One-click Google Login (lazy-loads Firebase on demand)
  const signIn = useCallback(async () => {
    setAuthError(null);
    setFirebaseEnabled(true);
    try {
      const fb = await import("./firebase");
      await fb.signInWithGoogle();
      try {
        window.localStorage.setItem(AUTH_ACTIVE_KEY, "1");
      } catch {
        /* ignore */
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      if (!message.includes("popup-closed-by-user")) {
        setAuthError(message);
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    try {
      const fb = await import("./firebase");
      await fb.signOutUser();
      try {
        window.localStorage.removeItem(AUTH_ACTIVE_KEY);
      } catch {
        /* ignore */
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Sign out failed");
    }
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  // Save scan
  const saveScan = useCallback(
    async (scan: ScanResult) => {
      setState((current) => ({ ...current, scan }));

      if (user) {
        const scanPath = `users/${user.uid}/scans/${scan.id}`;
        try {
          const [{ doc, setDoc }, fb] = await Promise.all([
            import("firebase/firestore"),
            import("./firebase"),
          ]);
          const scanRef = doc(fb.db, "users", user.uid, "scans", scan.id);
          await setDoc(scanRef, {
            id: scan.id,
            userId: user.uid,
            createdAt: scan.createdAt,
            checked: scan.checked,
            demo: Boolean(scan.demo),
            profile: scan.profile,
            findings: scan.findings,
            breaches: scan.breaches,
            ...(scan.swarmReports ? { swarmReports: scan.swarmReports } : {}),
          });
        } catch (err) {
          const fb = await import("./firebase");
          fb.handleFirestoreError(err, fb.OperationType.WRITE, scanPath);
        }
      }
    },
    [user]
  );

  const saveRequests = useCallback((requests: RemovalRequest[]) => {
    setState((current) => ({ ...current, requests }));
  }, []);

  // Upsert request
  const upsertRequest = useCallback(
    async (request: RemovalRequest) => {
      setState((current) => {
        const exists = current.requests.some((item) => item.id === request.id);
        return {
          ...current,
          requests: exists
            ? current.requests.map((item) => (item.id === request.id ? request : item))
            : [request, ...current.requests],
        };
      });

      if (user) {
        const reqPath = `users/${user.uid}/requests/${request.id}`;
        try {
          const [{ doc, setDoc }, fb] = await Promise.all([
            import("firebase/firestore"),
            import("./firebase"),
          ]);
          const reqRef = doc(fb.db, "users", user.uid, "requests", request.id);
          const payload = {
            id: request.id,
            userId: user.uid,
            findingId: request.findingId,
            brokerName: (request.brokerName || "").slice(0, 128),
            domain: (request.domain || "").slice(0, 128),
            category: (request.category || "").slice(0, 64),
            contactEmail: (request.contactEmail || "").slice(0, 256),
            subject: (request.subject || "").slice(0, 256),
            body: (request.body || "").slice(0, 10000),
            status: request.status,
            createdAt: request.createdAt,
            sentAt: request.sentAt || "",
            followUpAt: request.followUpAt || "",
            removalUrl: (request.removalUrl || "").slice(0, 512),
            updatedAt: new Date().toISOString(),
          };
          await setDoc(reqRef, payload, { merge: true });
        } catch (err) {
          const fb = await import("./firebase");
          fb.handleFirestoreError(err, fb.OperationType.WRITE, reqPath);
        }
      }
    },
    [user]
  );

  // Set request status
  const setRequestStatus = useCallback(
    async (id: string, status: RequestStatus) => {
      const now = new Date().toISOString();
      const existingReq = state.requests.find((r) => r.id === id);
      const isFirstSend = status === "sent" && !existingReq?.sentAt;
      const nextSentAt = status === "drafted" ? existingReq?.sentAt : existingReq?.sentAt ?? now;
      const nextFollowUpAt = isFirstSend ? addDays(now, 30) : existingReq?.followUpAt;

      setState((current) => ({
        ...current,
        requests: current.requests.map((request) => {
          if (request.id !== id) return request;
          return {
            ...request,
            status,
            sentAt: nextSentAt,
            followUpAt: nextFollowUpAt,
          };
        }),
      }));

      if (user) {
        const reqPath = `users/${user.uid}/requests/${id}`;
        try {
          const [{ doc, updateDoc }, fb] = await Promise.all([
            import("firebase/firestore"),
            import("./firebase"),
          ]);
          const reqRef = doc(fb.db, "users", user.uid, "requests", id);
          const updatePayload: Record<string, unknown> = {
            status,
            updatedAt: now,
          };
          if (nextSentAt) updatePayload.sentAt = nextSentAt;
          if (nextFollowUpAt) updatePayload.followUpAt = nextFollowUpAt;
          await updateDoc(reqRef, updatePayload);
        } catch (err) {
          const fb = await import("./firebase");
          fb.handleFirestoreError(err, fb.OperationType.UPDATE, reqPath);
        }
      }
    },
    [user, state.requests]
  );

  // Remove request
  const removeRequest = useCallback(
    async (id: string) => {
      setState((current) => ({
        ...current,
        requests: current.requests.filter((request) => request.id !== id),
      }));

      if (user) {
        const reqPath = `users/${user.uid}/requests/${id}`;
        try {
          const [{ doc, deleteDoc }, fb] = await Promise.all([
            import("firebase/firestore"),
            import("./firebase"),
          ]);
          const reqRef = doc(fb.db, "users", user.uid, "requests", id);
          await deleteDoc(reqRef);
        } catch (err) {
          const fb = await import("./firebase");
          fb.handleFirestoreError(err, fb.OperationType.DELETE, reqPath);
        }
      }
    },
    [user]
  );

  const reset = useCallback(() => {
    setState(EMPTY);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      hydrated,
      user,
      authLoading,
      authError,
      isSyncing,
      scan: state.scan,
      requests: state.requests,
      saveScan,
      saveRequests,
      upsertRequest,
      setRequestStatus,
      removeRequest,
      reset,
      signIn,
      signOut,
      clearAuthError,
    }),
    [
      hydrated,
      user,
      authLoading,
      authError,
      isSyncing,
      state.scan,
      state.requests,
      saveScan,
      saveRequests,
      upsertRequest,
      setRequestStatus,
      removeRequest,
      reset,
      signIn,
      signOut,
      clearAuthError,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}
