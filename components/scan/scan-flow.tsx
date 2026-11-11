"use client";

import { useEffect, useState } from "react";
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

const PHONE_STAGES = [
  {
    label: "Step 01 · Searching Google for Exact Phone Number",
    detail: "Checking plain 10-digit, +91 / international, and spaced formats across the web",
  },
  {
    label: "Step 02 · Extracting All Web Pages & Blog Mentions",
    detail: "Capturing every agency page, blog post, case study, and directory listing your number",
  },
  {
    label: "Step 03 · Scraping Contact Emails from Discovered Sites",
    detail: "Extracting owner, webmaster, and privacy emails directly from each website",
  },
  {
    label: "Step 04 · Preparing Phone Removal Queue",
    detail: "Building your Phone Number Removal List for 1-click Gmail dispatch",
  },
];

const EMAIL_STAGES = [
  {
    label: "Step 01 · Searching Google for Exact Email Address",
    detail: "Scanning web pages, blogs, contact footers, and B2B email indexes",
  },
  {
    label: "Step 02 · Extracting All Web Pages Mentioning Your Email",
    detail: "Capturing every website and page where your email address is published",
  },
  {
    label: "Step 03 · Resolving Site Owner & Privacy Emails",
    detail: "Extracting contact and DPO email addresses from each discovered website",
  },
  {
    label: "Step 04 · Preparing Email Removal Queue",
    detail: "Building your Email Removal List for 1-click Gmail dispatch",
  },
];

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

  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 92) return current;
        return Math.min(92, current + 2.4 + Math.random() * 1.8);
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [status]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!agreed) {
      setError("Please confirm you are authorised to request removal of this number or email.");
      return;
    }

    const cleanPhone = phone.trim();
    const cleanEmail = email.trim();

    if (scanMode === "phone" && cleanPhone.replace(/\D/g, "").length < 7) {
      setError("Please enter a valid phone number (e.g. 9819708112 or +91 9819708112).");
      return;
    }

    if (scanMode === "email" && !/\S+@\S+\.\S+/.test(cleanEmail)) {
      setError("Please enter a valid email address (e.g. you@example.com).");
      return;
    }

    setError("");
    setStatus("running");
    setProgress(10);

    try {
      const response = await fetch("/api/swarm", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
        city: existingScan?.profile.city || "India",
        region: existingScan?.profile.region || "",
        country: existingScan?.profile.country || "India",
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
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Something interrupted the scan.");
    }
  };

  if (status === "running") {
    const stages = scanMode === "phone" ? PHONE_STAGES : EMAIL_STAGES;
    const stageIndex = Math.min(stages.length - 1, Math.floor(progress / 25));
    const currentStage = stages[stageIndex];
    const targetDisplay = scanMode === "phone" ? phone.trim() : email.trim();

    return (
      <div
        className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]"
        role="status"
        aria-live="polite"
      >
        <div className="card p-7 md:p-9">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-[0.2em] text-moss-deep">
                {scanMode === "phone" ? (
                  <Phone className="size-3.5 animate-pulse text-moss" />
                ) : (
                  <Mail className="size-3.5 animate-pulse text-moss" />
                )}
                {scanMode === "phone" ? "Phone Number Scan Active" : "Email Scan Active"}
              </p>
              <h2 className="mt-2 font-display text-[1.9rem] leading-tight">
                Finding every web page mentioning {targetDisplay}
              </h2>
            </div>
            <span className="font-display text-3xl tabular-nums text-moss">
              {Math.round(progress)}%
            </span>
          </div>

          <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-mist">
            <div
              className="h-full rounded-full bg-moss transition-[width] duration-200 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <ol className="mt-8 space-y-4">
            {stages.map((stage, index) => {
              const done = progress >= (index + 1) * 25;
              const active = index === stageIndex && !done;
              return (
                <li key={stage.label} className="flex items-start gap-3">
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
          <div className="card flex-1 p-7">
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
      <div className="card p-6 md:p-8">
        {/* Bifurcated Mode Selector: Phone Number Scan vs Email Scan */}
        <div className="grid grid-cols-2 gap-2.5 rounded-2xl border border-line bg-mist/60 p-2">
          <button
            type="button"
            onClick={() => {
              setScanMode("phone");
              setError("");
            }}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-3.5 px-4 text-sm font-medium transition-all",
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
              "flex items-center justify-center gap-2 rounded-xl py-3.5 px-4 text-sm font-medium transition-all",
              scanMode === "email"
                ? "bg-moss text-paper shadow-sm"
                : "text-ink-soft hover:bg-surface hover:text-ink"
            )}
          >
            <Mail className="size-4" strokeWidth={2} />
            2. Email Scan
          </button>
        </div>

        <div className="mt-7 space-y-6">
          {scanMode === "phone" ? (
            <div className="rounded-2xl border border-moss/30 bg-moss-soft/35 p-6">
              <label className="label flex items-center gap-2 text-base" htmlFor="phoneInput">
                <Phone className="size-4 text-moss" />
                Enter Phone Number to Find Across the Internet <span className="text-clay">*</span>
              </label>
              <input
                id="phoneInput"
                type="tel"
                className="field mt-2 bg-surface font-mono text-base py-3.5"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="e.g. 9819708112 or +91 9819708112"
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
            <div className="rounded-2xl border border-moss/30 bg-moss-soft/35 p-6">
              <label className="label flex items-center gap-2 text-base" htmlFor="emailInput">
                <Mail className="size-4 text-moss" />
                Enter Email Address to Find Across the Internet <span className="text-clay">*</span>
              </label>
              <input
                id="emailInput"
                type="email"
                className="field mt-2 bg-surface font-mono text-base py-3.5"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="e.g. owaiskhan@adryvo.in or you@gmail.com"
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
              placeholder="e.g. Owais Khan"
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
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-clay/25 bg-clay-soft px-4 py-3 text-xs leading-relaxed text-clay"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
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
        <div className="card p-6 md:p-7">
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
                body: "Automatically extracts the contact/owner email from each website (e.g. stalitemedia@gmail.com, owaiskhan@adryvo.in) so you can send a 1-click Gmail removal request.",
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
