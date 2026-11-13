"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { GoogleMark } from "@/components/google-mark";
import {
  LogOut,
  Cloud,
  ShieldCheck,
  User as UserIcon,
  AlertCircle,
  X,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { useStore } from "@/lib/store";
import firebaseConfig from "@/firebase-applet-config.json";
import { copyText } from "@/lib/utils";

const FIREBASE_PROJECT_ID = firebaseConfig.projectId;

export function AuthButton() {
  const { user, authLoading, signIn, signOut, authError, clearAuthError, isSyncing } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentHostname =
    typeof window !== "undefined" ? window.location.hostname : "untrace.justsimpleapps.online";
  const isUnauthorizedDomain = Boolean(
    authError && authError.toLowerCase().includes("unauthorized-domain")
  );
  const domainsToAuthorize = Array.from(
    new Set([currentHostname, "untrace.justsimpleapps.online"].filter(Boolean))
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signIn();
    } finally {
      setSigningIn(false);
    }
  };

  const handleCopyDomain = async (domain: string) => {
    const ok = await copyText(domain);
    if (ok) {
      setCopiedDomain(domain);
      window.setTimeout(() => setCopiedDomain(null), 2000);
    }
  };

  if (authLoading) {
    return (
      <div className="h-9 w-24 animate-pulse rounded-full bg-mist" aria-hidden="true" />
    );
  }

  return (
    <div className="relative inline-flex items-center" ref={menuRef}>
      {/* Auth error notification / unauthorised domain fix assistant */}
      {authError && !isUnauthorizedDomain && (
        <div
          role="alert"
          className="absolute right-0 top-12 z-50 flex w-72 sm:w-80 items-start gap-2 rounded-xl border border-clay/30 bg-clay-soft p-3 text-xs leading-relaxed text-clay shadow-lg"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1 break-words">{authError}</span>
          <button
            onClick={clearAuthError}
            className="rounded p-0.5 hover:bg-clay/10"
            aria-label="Dismiss error"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {authError && isUnauthorizedDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={clearAuthError}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-domain-modal-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl animate-fade-in"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-soft text-amber">
                  <AlertCircle className="size-5" />
                </span>
                <div>
                  <h3 id="auth-domain-modal-title" className="text-base font-medium text-ink">
                    Authorize this domain in Firebase
                  </h3>
                  <p className="text-xs text-muted">
                    Error: <code className="font-mono text-clay">auth/unauthorized-domain</code>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearAuthError}
                className="rounded-lg p-1 text-muted hover:bg-mist hover:text-ink"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="mt-3.5 text-xs leading-relaxed text-ink-soft">
              Firebase blocks Google sign-in popups from domains that aren&apos;t on your project&apos;s{" "}
              <strong className="font-medium text-ink">Authorized domains</strong> allowlist. Add the
              domain(s) below in your Firebase Console:
            </p>

            <div className="mt-4 space-y-2">
              {domainsToAuthorize.map((domain) => (
                <div
                  key={domain}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line bg-mist/60 px-3 py-2"
                >
                  <code className="truncate font-mono text-xs text-ink">{domain}</code>
                  <button
                    type="button"
                    onClick={() => handleCopyDomain(domain)}
                    className="btn btn-secondary btn-sm py-1 px-2.5 text-xs shrink-0"
                  >
                    {copiedDomain === domain ? (
                      <>
                        <Check className="size-3.5 text-moss" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>

            <ol className="mt-4 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted">
              <li>
                Open{" "}
                <strong className="font-medium text-ink">
                  Firebase Console &rarr; Authentication &rarr; Settings &rarr; Authorized domains
                </strong>
                .
              </li>
              <li>
                Click <strong className="font-medium text-ink">Add domain</strong> and paste the
                copied domain above.
              </li>
              <li>Come back here and click Sign in again.</li>
            </ol>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
              <button
                type="button"
                onClick={clearAuthError}
                className="btn btn-quiet btn-sm text-xs"
              >
                Close
              </button>
              <a
                href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm text-xs"
              >
                Open Firebase Auth Settings
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {user ? (
        <div className="relative">
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-xs font-medium text-ink transition-all hover:border-line-strong hover:bg-mist focus:outline-none"
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            {user.photoURL ? (
              <Image
                src={user.photoURL}
                alt={user.displayName || "User avatar"}
                width={26}
                height={26}
                className="size-[26px] rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex size-[26px] items-center justify-center rounded-full bg-moss-soft text-[0.7rem] font-semibold text-moss-deep">
                {user.displayName ? user.displayName.charAt(0).toUpperCase() : <UserIcon className="size-3.5" />}
              </div>
            )}
            <span className="max-w-[100px] truncate sm:max-w-[130px]">
              {user.displayName || user.email?.split("@")[0] || "Account"}
            </span>
            {isSyncing && (
              <Cloud className="size-3 animate-pulse text-moss" aria-label="Syncing to cloud" />
            )}
          </button>

          {/* User profile dropdown */}
          {menuOpen && (
            <div className="absolute right-0 top-11 z-50 w-64 rounded-2xl border border-line bg-surface p-2 shadow-lg animate-fade-in">
              <div className="border-b border-line px-3 py-2.5">
                <p className="text-xs font-medium text-ink truncate">
                  {user.displayName || "Untrace Member"}
                </p>
                <p className="text-[0.7rem] text-muted truncate">{user.email}</p>
                <div className="mt-2 flex items-center gap-1.5 text-[0.6875rem] text-moss">
                  <ShieldCheck className="size-3.5" />
                  <span>Cloud backup connected</span>
                </div>
              </div>

              <div className="py-1">
                <Link
                  href="/dashboard"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-soft hover:bg-mist hover:text-ink"
                >
                  View your report
                </Link>
                <Link
                  href="/scan"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-soft hover:bg-mist hover:text-ink"
                >
                  Run new scan
                </Link>
              </div>

              <div className="border-t border-line pt-1">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    signOut();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-clay hover:bg-clay-soft"
                >
                  <LogOut className="size-3.5" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="btn btn-secondary btn-sm flex items-center gap-2 text-xs font-medium transition-all hover:bg-mist"
          title="One-click Google sign in"
        >
          <GoogleMark className="size-3.5 shrink-0" />
          <span>{signingIn ? "Signing in..." : "Sign in"}</span>
        </button>
      )}
    </div>
  );
}
