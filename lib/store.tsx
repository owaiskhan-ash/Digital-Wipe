"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { RemovalRequest, RequestStatus, ScanResult, StoredState } from "./types";
import { addDays } from "./utils";

const STORAGE_KEY = "untrace.state.v1";

const EMPTY: StoredState = { scan: null, requests: [], version: 1 };

type StoreValue = {
  hydrated: boolean;
  scan: ScanResult | null;
  requests: RemovalRequest[];
  saveScan: (scan: ScanResult) => void;
  saveRequests: (requests: RemovalRequest[]) => void;
  upsertRequest: (request: RemovalRequest) => void;
  setRequestStatus: (id: string, status: RequestStatus) => void;
  removeRequest: (id: string) => void;
  reset: () => void;
};

const StoreContext = createContext<StoreValue | null>(null);

function read(): StoredState {
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

  useEffect(() => {
    setState(read());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked — the session still works in memory */
    }
  }, [state, hydrated]);

  const saveScan = useCallback((scan: ScanResult) => {
    setState((current) => ({ ...current, scan }));
  }, []);

  const saveRequests = useCallback((requests: RemovalRequest[]) => {
    setState((current) => ({ ...current, requests }));
  }, []);

  const upsertRequest = useCallback((request: RemovalRequest) => {
    setState((current) => {
      const exists = current.requests.some((item) => item.id === request.id);
      return {
        ...current,
        requests: exists
          ? current.requests.map((item) => (item.id === request.id ? request : item))
          : [request, ...current.requests],
      };
    });
  }, []);

  const setRequestStatus = useCallback((id: string, status: RequestStatus) => {
    setState((current) => ({
      ...current,
      requests: current.requests.map((request) => {
        if (request.id !== id) return request;
        const now = new Date().toISOString();
        const isFirstSend = status === "sent" && !request.sentAt;
        return {
          ...request,
          status,
          sentAt: status === "drafted" ? request.sentAt : request.sentAt ?? now,
          followUpAt: isFirstSend ? addDays(now, 30) : request.followUpAt,
        };
      }),
    }));
  }, []);

  const removeRequest = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      requests: current.requests.filter((request) => request.id !== id),
    }));
  }, []);

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
      scan: state.scan,
      requests: state.requests,
      saveScan,
      saveRequests,
      upsertRequest,
      setRequestStatus,
      removeRequest,
      reset,
    }),
    [hydrated, state, saveScan, saveRequests, upsertRequest, setRequestStatus, removeRequest, reset],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}
