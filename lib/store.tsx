"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import type {
  RemovalRequest,
  RequestStatus,
  ScanResult,
  StoredState,
} from "./types";
import { addDays } from "./utils";
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  setCachedAccessToken,
  signInWithGoogle,
  signOutUser,
  testConnection,
} from "./firebase";

const STORAGE_KEY = "untrace.state.v1";
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
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Initial local state hydration
  useEffect(() => {
    setState(readLocal());
    setHydrated(true);
    testConnection().catch((err) => {
      console.warn("Firestore connection check:", err);
    });
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

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (!currentUser) {
        setCachedAccessToken(null);
      } else {
        setIsSyncing(true);
        const userDocPath = `users/${currentUser.uid}`;
        try {
          // Sync or create user profile
          const userRef = doc(db, "users", currentUser.uid);
          let existingData: Record<string, unknown> | null = null;
          try {
            const snap = await getDoc(userRef);
            if (snap.exists()) {
              existingData = snap.data();
            }
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, userDocPath);
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
            handleFirestoreError(err, OperationType.WRITE, userDocPath);
          }

          // Fetch the most recent scan from Firestore if local state is empty
          const scansColPath = `users/${currentUser.uid}/scans`;
          try {
            const scansQuery = query(
              collection(db, "users", currentUser.uid, "scans"),
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
            } else if (state.scan) {
              // Upload current local scan to user's Firestore scans collection
              const newScanRef = doc(db, "users", currentUser.uid, "scans", state.scan.id);
              await setDoc(newScanRef, {
                id: state.scan.id,
                userId: currentUser.uid,
                createdAt: state.scan.createdAt,
                checked: state.scan.checked,
                demo: Boolean(state.scan.demo),
                profile: state.scan.profile,
                findings: state.scan.findings,
                breaches: state.scan.breaches,
                ...(state.scan.swarmReports ? { swarmReports: state.scan.swarmReports } : {}),
              });
            }
          } catch (err) {
            console.warn("Scan cloud sync notice:", err);
          }
        } catch (err) {
          console.error("User initialization error:", err);
        } finally {
          setIsSyncing(false);
        }
      }
    });

    return () => unsubscribe();
  }, [hydrated]);

  // Firestore real-time listener for removal requests when logged in
  useEffect(() => {
    if (!user) return;

    const reqsPath = `users/${user.uid}/requests`;
    const q = query(
      collection(db, "users", user.uid, "requests"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
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
        handleFirestoreError(error, OperationType.GET, reqsPath);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // One-click Google Login
  const signIn = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      // Ignore user closed popup
      if (!message.includes("popup-closed-by-user")) {
        setAuthError(message);
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    try {
      await signOutUser();
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
          const scanRef = doc(db, "users", user.uid, "scans", scan.id);
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
          handleFirestoreError(err, OperationType.WRITE, scanPath);
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
          const reqRef = doc(db, "users", user.uid, "requests", request.id);
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
          handleFirestoreError(err, OperationType.WRITE, reqPath);
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
          const reqRef = doc(db, "users", user.uid, "requests", id);
          const updatePayload: Record<string, unknown> = {
            status,
            updatedAt: now,
          };
          if (nextSentAt) updatePayload.sentAt = nextSentAt;
          if (nextFollowUpAt) updatePayload.followUpAt = nextFollowUpAt;
          await updateDoc(reqRef, updatePayload);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, reqPath);
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
          const reqRef = doc(db, "users", user.uid, "requests", id);
          await deleteDoc(reqRef);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, reqPath);
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
