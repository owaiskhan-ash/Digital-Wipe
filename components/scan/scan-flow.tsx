"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Globe,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  Phone,
  Search,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { BreachExposure, Finding, ScanResult, SwarmAgentReport } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProgressRing } from "@/components/scan/progress-ring";

const PHONE_STAGES = [
  {
    label: "Step 01 · Searching Google for Exact Phone Number",
    short: "Search",
    detail: "Checking plain 10-digit, +91 / international, and spaced formats across Google Search",
  },
  {
    label: "Step 02 · Extracting All Web Pages & Blog Mentions",
    short: "Extract",
    detail: "Capturing every agency page, blog post, case study, and directory listing your number",
  },
  {
    label: "Step 03 · Compiling Results into Dashboard",
    short: "Compile",
    detail: "Organizing all verified web pages (site contact emails can be resolved on-demand in your queue)",
  },
];

const EMAIL_STAGES = [
  {
    label: "Step 01 · Searching Google for Exact Email Address",
    short: "Search",
    detail: "Scanning Google Search for every web page, blog, and directory mentioning this address",
  },
  {
    label: "Step 02 · Extracting All Web Pages Mentioning Your Email",
    short: "Extract",
    detail: "Capturing every website and page where your email address is published",
  },
  {
    label: "Step 03 · Compiling Results into Dashboard",
    short: "Compile",
    detail: "Organizing all verified web pages (site contact emails can be resolved on-demand in your queue)",
  },
];

const CLIENT_TIMEOUT_MS = 50_000;

export function ScanFlow({ initialEmail = "" }: { initialEmail?: string }) {
  const router = useRouter();
  const { scan: existingScan, saveScan } = useStore();
  const [scanMode, setScanMode] = useState<"phone" | "email">(
    initialEmail ? "email" : "phone"
  );
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [fullName, setFullName] = useState("");
  const [agreed, setAgreed] = useState(true);
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const inFlight = useRef<{ controller: AbortController; cancelled: boolean } | null>(null);

  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 95) return current;
        if (current < 85) {
          return Math.min(85, current + 4.5 + Math.random() * 3.5);
        }
        return Math.min(95, current + 0.8);
      });
    }, 200);
    return () => window.clearInterval(timer);
  }, [status]);

  // Abort an unfinished request when the page goes away, so a late response
  // cannot navigate the user out of a page they already left.
  useEffect(() => {
    return () => {
      inFlight.current?.controller.abort();
      inFlight.current = null;
    };
  }, []);

  const cancelScan = () => {
    if (inFlight.current) {
      inFlight.current.cancelled = true;
      inFlight.current.controller.abort();
      inFlight.current = null;
    }
    setStatus("idle");
    setProgress(0);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!agreed) {
      setError("Please confirm you are authorised to request removal of this number or email.");
      return;
    }

    const cleanPhone = phone.trim();
    const cleanEmail = email.trim();

    if (scanMode === "phone" && cleanPhone.replace(/\D/g, "").length < 7) {
      setError("Please enter a valid phone number (at least 7 digits).");
      return;
    }

    if (scanMode === "email" && !/\S+@\S+\.\S+/.test(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setError("");
    setStatus("running");
    setProgress(15);

    const controller = new AbortController();
    const entry = { controller, cancelled: false };
    inFlight.current = entry;
    const timeoutId = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    try {
      const response = await fetch("/api/swarm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          mode: scanMode,
          phone: scanMode === "phone" ? cleanPhone : undefined,
          email: scanMode === "email" ? cleanEmail : undefined,
          fullName: fullName.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        findings?: Finding[];
        reports?: SwarmAgentReport[];
        breaches?: BreachExposure[];
        checked?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || "Could not complete the scan. Please try again."
        );
      }

      // The user cancelled while this request was in flight: drop the result.
      if (entry.cancelled) return;

      const incomingFindings = payload.findings ?? [];
      const incomingReports = payload.reports ?? [];

      // Keep findings from the other scan mode so Phone Scan and Email Scan lists stay separate and preserved
      const preservedOtherModeFindings = (existingScan?.findings ?? []).filter(
        (f) => f.matchType && f.matchType !== scanMode
      );

      const mergedFindings = [...incomingFindings, ...preservedOtherModeFindings];

      const mergedProfile = {
        fullName:
          fullName.trim() ||
          existingScan?.profile.fullName ||
          (cleanEmail ? cleanEmail.split("@")[0] : "") ||
          cleanPhone ||
          "Data Subject",
        city: existingScan?.profile.city || "",
        region: existingScan?.profile.region || "",
        country: existingScan?.profile.country || "United States",
        phones:
          scanMode === "phone"
            ? Array.from(new Set([cleanPhone, ...(existingScan?.profile.phones ?? [])]))
            : existingScan?.profile.phones ?? [],
        emails:
          scanMode === "email"
            ? Array.from(new Set([cleanEmail, ...(existingScan?.profile.emails ?? [])]))
            : existingScan?.profile.emails ?? [],
        usernames: existingScan?.profile.usernames ?? [],
      };

      const scanResult: ScanResult = {
        id: `scan_${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        profile: mergedProfile,
        checked: (existingScan?.checked ?? 0) + (payload.checked ?? incomingFindings.length),
        findings: mergedFindings,
        breaches: payload.breaches ?? [],
        swarmReports: incomingReports,
        demo: false,
      };

      setProgress(100);
      saveScan(scanResult);
      window.setTimeout(() => {
        router.push(`/dashboard?mode=${scanMode}`);
      }, 200);
    } catch (cause) {
      // Cancelled by the user: the form is already back, say nothing.
      if (entry.cancelled) return;

      setStatus("error");
      setProgress(0);
      const isTimeout = controller.signal.aborted;
      setError(
        isTimeout
          ? "The scan ran out of time while searching the open web. Try again, or set a search provider key so scans do not depend on the grounded search finishing."
          : cause instanceof Error
            ? cause.message
            : "Something interrupted the scan. Please try again."
      );
    } finally {
      window.clearTimeout(timeoutId);
      if (inFlight.current === entry) inFlight.current = null;
    }
  };

  if (status === "running") {
    const stages = scanMode === "phone" ? PHONE_STAGES : EMAIL_STAGES;
    const stageIndex = Math.min(stages.length - 1, Math.floor(progress / 33.4));
    const currentStage = stages[stageIndex];
    const targetDisplay = scanMode === "phone" ? phone.trim() : email.trim();

    return (
      <div
        className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]"
        role="status"
        aria-live="polite"
      >
        <div data-reveal className="card p-5 md:p-9">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-[0.2em] text-moss-deep">
                {scanMode === "phone" ? (
                  <Phone className="size-3.5 animate-pulse text-moss" />
                ) : (
                  <Mail className="size-3.5 animate-pulse text-moss" />
                )}
                {scanMode === "phone" ? "Phone Number Scan Active" : "Email Scan Active"}
              </p>
              <h2 className="mt-2 font-display text-[1.6rem] leading-tight md:text-[1.9rem]">
                Finding every web page mentioning {targetDisplay}
              </h2>
            </div>
          </div>

          <ProgressRing
            progress={progress}
            stages={stages}
            activeIndex={stageIndex}
          />
          <p className="sr-only" aria-live="polite">
            {currentStage.label}
          </p>

          <div className="mt-5 flex items-center justify-between gap-3 text-xs text-muted">
            <span className="min-w-0">
              <span className="sm:hidden">Searching the live web…</span>
              <span className="hidden sm:inline">Live web search in progress</span>
            </span>
            <button
              type="button"
              onClick={cancelScan}
              className="shrink-0 text-muted underline underline-offset-2 transition-colors hover:text-ink"
            >
              Cancel scan
            </button>
          </div>

          <ol className="mt-8 space-y-4">
            {stages.map((stage, index) => {
              const done = progress >= (index + 1) * 33.3;
              const active = index === stageIndex && !done;
              return (
                <li
                  key={stage.label}
                  className="flex animate-fade-blur items-start gap-3"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <span
                    className={[
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border",
                      done
                        ? "border-moss bg-moss text-paper"
                        : active
                          ? "border-moss bg-moss-soft text-moss"
                          : "border-line bg-surface text-line-strong",
                    ].join(" ")}
                  >
                    {done ? (
                      <Check className="size-3.5" strokeWidth={2.4} aria-hidden />
                    ) : active ? (
                      <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden />
                    ) : (
                      <span className="size-1.5 rounded-full bg-current" aria-hidden />
                    )}
                  </span>
                  <div>
                    <p
                      className={[
                        "text-sm transition-colors",
                        done || active ? "text-ink font-medium" : "text-muted",
                      ].join(" ")}
                    >
                      {stage.label}
                    </p>
                    <p className="text-xs text-muted">{stage.detail}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <aside className="flex flex-col gap-5">
          <div data-reveal className="card flex-1 p-5 md:p-7">
            <p className="text-[0.6875rem] uppercase tracking-[0.2em] text-muted">
              Current Step
            </p>
            <p className="mt-3 font-display text-[1.55rem] leading-tight">
              {currentStage.label}
            </p>
            <p className="mt-1.5 text-xs text-muted">{currentStage.detail}</p>

            <div className="mt-7 rounded-xl border border-line bg-mist/60 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between text-ink-soft">
                <span className="flex items-center gap-1.5 font-medium">
                  {scanMode === "phone" ? (
                    <Phone className="size-3.5 text-moss" />
                  ) : (
                    <Mail className="size-3.5 text-moss" />
                  )}
                  {scanMode === "phone" ? "Target Phone" : "Target Email"}
                </span>
                <span className="truncate font-mono text-[0.75rem] font-semibold text-ink">
                  {targetDisplay}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted">
                <span className="flex items-center gap-1.5">
                  <Globe className="size-3.5 text-moss" />
                  Search Engine
                </span>
                <span className="text-moss-deep font-medium">
                  Google Search Grounding + Live Page Scraper
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="grid items-start gap-5 lg:grid-cols-[1.15fr_0.85fr]"
    >
      <div data-reveal className="card p-4 md:p-8">
        {/* Bifurcated Mode Selector: Phone Number Scan vs Email Scan */}
        <div className="grid grid-cols-2 gap-2.5 rounded-2xl border border-line bg-mist/60 p-2">
          <button
            type="button"
            onClick={() => {
              setScanMode("phone");
              setError("");
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-1.5 rounded-xl px-2.5 py-3 text-[0.8125rem] font-medium leading-tight transition-all sm:flex-row sm:gap-2 sm:px-4 sm:py-3.5 sm:text-sm",
              scanMode === "phone"
                ? "bg-moss text-paper shadow-sm"
                : "text-ink-soft hover:bg-surface hover:text-ink"
            )}
          >
            <Phone className="size-4" strokeWidth={2} />
            1. Phone Number Scan
          </button>

          <button
            type="button"
            onClick={() => {
              setScanMode("email");
              setError("");
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-1.5 rounded-xl px-2.5 py-3 text-[0.8125rem] font-medium leading-tight transition-all sm:flex-row sm:gap-2 sm:px-4 sm:py-3.5 sm:text-sm",
              scanMode === "email"
                ? "bg-moss text-paper shadow-sm"
                : "text-ink-soft hover:bg-surface hover:text-ink"
            )}
          >
            <Mail className="size-4" strokeWidth={2} />
            2. Email Scan
          </button>
        </div>

        <div className="mt-5 space-y-5 md:mt-7 md:space-y-6">
          {scanMode === "phone" ? (
            <div className="rounded-2xl border border-moss/30 bg-moss-soft/35 p-4 md:p-6">
              <label className="label flex items-start gap-2 text-[0.9375rem] leading-snug md:items-center md:text-base" htmlFor="phoneInput">
                <Phone className="size-4 text-moss" />
                Enter Phone Number to Find Across the Internet <span className="text-clay">*</span>
              </label>
              <input
                id="phoneInput"
                type="tel"
                className="field mt-2 bg-surface font-mono text-base py-3.5"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Enter your phone number"
                autoComplete="tel"
                inputMode="tel"
                required
              />
              <p className="mt-2.5 text-xs leading-relaxed text-muted">
                Searches Google for every website, agency page, blog post, case study, and
                caller-ID directory where this exact number is posted, and scrapes the contact
                email from each site so you can demand removal.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-moss/30 bg-moss-soft/35 p-4 md:p-6">
              <label className="label flex items-start gap-2 text-[0.9375rem] leading-snug md:items-center md:text-base" htmlFor="emailInput">
                <Mail className="size-4 text-moss" />
                Enter Email Address to Find Across the Internet <span className="text-clay">*</span>
              </label>
              <input
                id="emailInput"
                type="email"
                className="field mt-2 bg-surface font-mono text-base py-3.5"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email address"
                autoComplete="email"
                inputMode="email"
                required
              />
              <p className="mt-2.5 text-xs leading-relaxed text-muted">
                Searches Google for every webpage, blog footer, directory, and B2B contact
                list where this exact email address is published, and builds a dedicated Email
                Removal List.
              </p>
            </div>
          )}

          <div>
            <label className="label" htmlFor="fullName">
              Your Name (optional, only used to sign the removal email)
            </label>
            <input
              id="fullName"
              className="field"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Optional full name for signing letters"
              autoComplete="name"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-mist/50 p-4">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-moss)]"
            />
            <span className="text-xs leading-relaxed text-ink-soft">
              I confirm this {scanMode === "phone" ? "phone number" : "email address"} belongs
              to me, or to a client who authorised me to act for them, and that I
              may request its removal.
            </span>
          </label>

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-clay/30 bg-clay-soft p-4 text-xs leading-relaxed text-clay space-y-1.5"
            >
              <div className="flex items-start gap-2 font-medium">
                <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} aria-hidden />
                <span>{error}</span>
              </div>
              {/gemini|key|api key/i.test(error) && (
                <p className="pl-6 text-[0.72rem] text-ink-soft">
                  Tip: Live Google Search grounding uses Gemini to search the live web. Make sure a valid key is set in your <strong>Settings &gt; Secrets</strong> panel.
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5 md:mt-8 md:pt-6">
          <button type="submit" className="btn btn-primary" disabled={!agreed}>
            {scanMode === "phone" ? "Run Phone Number Scan" : "Run Email Scan"}
            <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
          </button>
          <span className="text-xs text-muted sm:ml-auto">
            Live Google Search + Page Email Scraper
          </span>
        </div>
      </div>

      <aside className="space-y-5">
        <div data-reveal className="card p-5 md:p-7">
          <p className="text-[0.6875rem] uppercase tracking-[0.2em] text-muted">
            Two Dedicated Scans
          </p>
          <ol className="mt-5 space-y-5">
            {[
              {
                icon: Phone,
                title: "1. Phone Number Scan",
                body: "Finds every website, blog post, case study, agency footer, and directory where your exact phone number is mentioned on Google.",
              },
              {
                icon: Mail,
                title: "2. Email Scan",
                body: "Finds every website, blog, directory, and B2B database where your exact email address is posted on Google.",
              },
              {
                icon: MailCheck,
                title: "Scrapes Contact Emails for Removal",
                body: "Automatically extracts the published contact or privacy email from each website so you can review and send a 1-click Gmail removal request.",
              },
            ].map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-mist text-moss">
                  <item.icon className="size-4" strokeWidth={1.6} aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl border border-line bg-moss-soft/60 p-6">
          <p className="flex items-center gap-2 text-xs font-medium text-moss-deep">
            <Lock className="size-3.5" strokeWidth={1.8} aria-hidden />
            Zero Common-Name Confusion
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            We never search by common name. Every result is strictly matched to your exact
            Phone Number or Email Address.
          </p>
        </div>
      </aside>
    </form>
  );
}
