"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Clock3,
  KeyRound,
  Loader2,
  LogIn,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { ADMIN_EMAILS, isAdminEmail } from "@/lib/admin";
import { GoogleMark } from "@/components/google-mark";
import { cn } from "@/lib/utils";

type LoginRow = {
  id: string;
  uid: string;
  email: string;
  name: string;
  at: string;
  via: string;
  ua?: string;
};

type SearchRow = {
  id: string;
  uid: string;
  email: string;
  mode: "phone" | "email";
  query: string;
  findings: number;
  at: string;
  source?: string;
};

type Account = {
  uid: string;
  email: string;
  name: string;
  logins: number;
  lastSeen: string;
  searches: SearchRow[];
};

const LOGIN_LIMIT = 200;
const SEARCH_LIMIT = 500;

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(account: Account): string {
  const source = account.name || account.email || "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

export function AdminPanel() {
  const { user, authLoading, signIn, authError } = useStore();

  const [logins, setLogins] = useState<LoginRow[]>([]);
  const [searches, setSearches] = useState<SearchRow[]>([]);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "denied" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = isAdminEmail(user?.email);

  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const [{ collection, getDocs, limit, orderBy, query }, { db }] = await Promise.all([
        import("firebase/firestore"),
        import("@/lib/firebase"),
      ]);

      const [loginSnaps, searchSnaps] = await Promise.all([
        getDocs(query(collection(db, "logins"), orderBy("at", "desc"), limit(LOGIN_LIMIT))),
        getDocs(query(collection(db, "searches"), orderBy("at", "desc"), limit(SEARCH_LIMIT))),
      ]);

      setLogins(
        loginSnaps.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Omit<LoginRow, "id">) }))
      );
      setSearches(
        searchSnaps.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Omit<SearchRow, "id">) }))
      );
      setPhase("ready");
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code ?? "";
      setPhase(code.includes("permission-denied") ? "denied" : "error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const accounts = useMemo(() => {
    const map = new Map<string, Account>();

    const ensure = (uid: string, email: string): Account => {
      const existing = map.get(uid);
      if (existing) return existing;
      const fresh: Account = {
        uid,
        email,
        name: "",
        logins: 0,
        lastSeen: "",
        searches: [],
      };
      map.set(uid, fresh);
      return fresh;
    };

    for (const search of searches) {
      const account = ensure(search.uid, search.email);
      account.searches.push(search);
      if (!account.email && search.email) account.email = search.email;
      if (search.at > account.lastSeen) account.lastSeen = search.at;
    }

    for (const login of logins) {
      const account = ensure(login.uid, login.email);
      account.logins += 1;
      if (!account.name && login.name) account.name = login.name;
      if (!account.email && login.email) account.email = login.email;
      if (login.at > account.lastSeen) account.lastSeen = login.at;
    }

    return Array.from(map.values()).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  }, [logins, searches]);

  const selected =
    accounts.find((account) => account.uid === selectedUid) ?? accounts[0] ?? null;

  const lastActivity = accounts[0]?.lastSeen ?? "";

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signIn();
    } finally {
      setSigningIn(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (authLoading) {
    return (
      <div className="card p-8" role="status" aria-live="polite">
        <div className="h-3 w-24 animate-pulse rounded bg-mist" />
        <div className="mt-5 h-8 w-2/3 animate-pulse rounded bg-mist" />
        <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-mist" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="card max-w-xl p-7 md:p-9">
        <p className="inline-flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-[0.2em] text-moss-deep">
          <KeyRound className="size-3.5 text-moss" strokeWidth={1.9} aria-hidden />
          Private
        </p>
        <h1 className="mt-3 font-display text-[1.75rem] leading-tight">
          This page is the owner&apos;s ledger.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Sign in with the owner account to read it. Everyone else gets this card
          and nothing behind it.
        </p>

        {authError ? (
          <p className="mt-5 flex items-start gap-2 rounded-xl border border-clay/30 bg-clay-soft px-3 py-2 text-xs text-clay">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{authError}</span>
          </p>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSignIn}
            disabled={signingIn}
            className="btn btn-primary"
          >
            {signingIn ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Opening Google…
              </>
            ) : (
              <>
                <GoogleMark className="size-4" />
                Sign in with Google
              </>
            )}
          </button>
          <Link href="/" className="btn btn-secondary">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="card max-w-xl p-7 md:p-9">
        <p className="inline-flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-[0.2em] text-muted">
          <KeyRound className="size-3.5 text-muted" strokeWidth={1.9} aria-hidden />
          Not for this account
        </p>
        <h1 className="mt-3 font-display text-[1.75rem] leading-tight">
          Nothing here belongs to you.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          You are signed in as{" "}
          <span className="font-mono text-[0.8125rem] text-ink">{user.email}</span>, which is not
          on the owner list.{" "}
          {ADMIN_EMAILS.length > 0
            ? "If this is your site, add that address to NEXT_PUBLIC_ADMIN_EMAILS and to firestore.rules."
            : ""}
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href="/dashboard" className="btn btn-secondary">
            Your own report
          </Link>
          <Link href="/" className="btn btn-ghost">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const stats = [
    { label: "Accounts", value: String(accounts.length), icon: Users },
    { label: "Sign-ins", value: String(logins.length), icon: LogIn },
    { label: "Searches", value: String(searches.length), icon: Search },
    { label: "Last activity", value: lastActivity ? when(lastActivity) : "—", icon: Clock3 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-muted">
            Operations
          </p>
          <h1 className="mt-3 font-display text-[2rem] leading-[1.08] md:text-[2.4rem]">
            Who came in, and what they looked for.
          </h1>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || phase === "loading"}
          className="btn btn-secondary btn-sm flex items-center gap-2"
        >
          <RefreshCw
            className={cn("size-3.5", (refreshing || phase === "loading") && "animate-spin")}
            strokeWidth={1.9}
            aria-hidden
          />
          Refresh
        </button>
      </div>

      {phase === "denied" ? (
        <div className="card border-clay/30 bg-clay-soft p-6">
          <p className="flex items-start gap-2 text-sm text-clay">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Firestore refused the read. The rules in the repository let{" "}
              {ADMIN_EMAILS.join(", ")} read <code className="font-mono">logins</code> and{" "}
              <code className="font-mono">searches</code>, but the published copy is older.
              Publish <code className="font-mono">firestore.rules</code> in the Firebase console,
              then refresh.
            </span>
          </p>
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="card border-clay/30 bg-clay-soft p-6">
          <p className="flex items-start gap-2 text-sm text-clay">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{error ?? "Could not load the ledger."}</span>
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-5">
            <p className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
              <stat.icon className="size-3.5 text-moss" strokeWidth={1.9} aria-hidden />
              {stat.label}
            </p>
            <p className="mt-3 font-display text-[1.6rem] leading-none text-ink">
              {phase === "loading" ? "·" : stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        {/* Accounts */}
        <section className="card overflow-hidden">
          <header className="border-b border-line px-5 py-4">
            <h2 className="text-sm font-medium text-ink">Accounts</h2>
            <p className="mt-1 text-xs text-muted">
              Everyone who has signed in, newest activity first.
            </p>
          </header>

          {phase === "loading" ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-14 animate-pulse rounded-xl bg-mist" />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted">
              No sign-ins recorded yet. They appear here the moment someone signs
              in with the published rules in place.
            </p>
          ) : (
            <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto">
              {accounts.map((account) => {
                const active = selected?.uid === account.uid;
                return (
                  <li key={account.uid}>
                    <button
                      type="button"
                      onClick={() => setSelectedUid(account.uid)}
                      className={cn(
                        "flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors",
                        active ? "bg-mist" : "hover:bg-mist/60"
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold",
                          active ? "bg-moss text-paper" : "bg-mist text-ink-soft"
                        )}
                        aria-hidden
                      >
                        {initials(account)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">
                          {account.name || account.email || account.uid}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[0.6875rem] text-muted">
                          {account.email || account.uid}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-[0.6875rem] text-muted">
                        <span className="block">{account.logins} sign-ins</span>
                        <span className="mt-0.5 block">
                          {account.searches.length} {account.searches.length === 1 ? "search" : "searches"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* One account's searches */}
        <section className="card overflow-hidden">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-medium text-ink">
                {selected ? selected.name || selected.email || "Account" : "Searches"}
              </h2>
              <p className="mt-1 truncate font-mono text-[0.6875rem] text-muted">
                {selected ? selected.email || selected.uid : "Pick an account on the left."}
              </p>
            </div>
            {selected ? (
              <p className="shrink-0 text-[0.6875rem] text-muted">
                Last seen {when(selected.lastSeen)}
              </p>
            ) : null}
          </header>

          {!selected ? (
            <p className="px-5 py-8 text-sm text-muted">Nothing selected.</p>
          ) : selected.searches.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted">
              Signed in, but no scan has been run from this account yet.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {selected.searches.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-mist text-moss">
                    {entry.mode === "phone" ? (
                      <Phone className="size-3.5" strokeWidth={1.9} aria-hidden />
                    ) : (
                      <Mail className="size-3.5" strokeWidth={1.9} aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[0.8125rem] text-ink">
                      {entry.query}
                    </span>
                    <span className="mt-0.5 block text-[0.6875rem] text-muted">
                      {entry.mode === "phone" ? "Phone scan" : "Email scan"}
                      {entry.source === "dashboard" ? " · dashboard" : " · scan page"}
                      {" · "}
                      {entry.findings} {entry.findings === 1 ? "page" : "pages"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.6875rem] text-muted">{when(entry.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Sign-in ledger */}
      <section className="card overflow-hidden">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-medium text-ink">Recent sign-ins</h2>
          <p className="mt-1 text-xs text-muted">
            One row per browser session, newest first.
          </p>
        </header>

        {phase === "loading" ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-10 animate-pulse rounded-xl bg-mist" />
            ))}
          </div>
        ) : logins.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted">No sign-ins recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[0.6875rem] uppercase tracking-[0.14em] text-muted">
                  <th className="px-5 py-2.5 font-medium">When</th>
                  <th className="px-5 py-2.5 font-medium">Account</th>
                  <th className="px-5 py-2.5 font-medium">How</th>
                  <th className="hidden px-5 py-2.5 font-medium md:table-cell">Client</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {logins.slice(0, 60).map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap px-5 py-2.5 text-[0.8125rem] text-ink-soft">
                      {when(entry.at)}
                    </td>
                    <td className="max-w-[9rem] truncate px-5 py-2.5 font-mono sm:max-w-[16rem] text-[0.75rem] text-ink">
                      {entry.email || entry.uid}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-[0.8125rem] text-ink-soft">
                      {entry.via === "google" ? "Google sign-in" : "Session restored"}
                    </td>
                    <td className="hidden max-w-[26rem] truncate px-5 py-2.5 text-[0.6875rem] text-muted md:table-cell">
                      {entry.ua || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[0.6875rem] text-muted">
        Showing the last {LOGIN_LIMIT} sign-ins and {SEARCH_LIMIT} searches. Pooled
        numbers, kept for the owner only; the reports themselves stay with each
        account.
      </p>
    </div>
  );
}
