"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { LogOut, Cloud, ShieldCheck, User as UserIcon, AlertCircle, X } from "lucide-react";
import { useStore } from "@/lib/store";

export function AuthButton() {
  const { user, authLoading, signIn, signOut, authError, clearAuthError, isSyncing } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  if (authLoading) {
    return (
      <div className="h-9 w-24 animate-pulse rounded-full bg-mist" aria-hidden="true" />
    );
  }

  return (
    <div className="relative inline-flex items-center" ref={menuRef}>
      {/* Auth error notification */}
      {authError && (
        <div className="absolute right-0 top-12 z-50 flex items-center gap-2 rounded-xl border border-clay/30 bg-clay-soft px-3 py-2 text-xs text-clay shadow-md">
          <AlertCircle className="size-4 shrink-0" />
          <span className="max-w-[200px] truncate">{authError}</span>
          <button
            onClick={clearAuthError}
            className="ml-1 rounded p-0.5 hover:bg-clay/10"
            aria-label="Dismiss error"
          >
            <X className="size-3" />
          </button>
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
          {/* Authentic Google "G" SVG */}
          <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{signingIn ? "Signing in..." : "Sign in"}</span>
        </button>
      )}
    </div>
  );
}
