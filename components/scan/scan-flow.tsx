"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Globe,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  Phone,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { BreachExposure, Finding, ScanResult, SwarmAgentReport } from "@/lib/types";

const STAGES = [
  {
    label: "Step 01 · Formatting Phone & Email Permutations",
    detail: "Generating international, local, dashed & raw number formats for pinpoint search",
  },
  {
    label: "Step 02 · Hunting Phone Number Exposures",
    detail: "Scanning caller-ID apps, reverse-phone lookups, WhatsApp indexes & B2B direct-dial brokers",
  },
  {
    label: "Step 03 · Hunting Email Address Exposures",
    detail: "Checking B2B email databases, recruiter tools, mailing lists & breach indexes",
  },
  {
    label: "Step 04 · Building Separate Phone & Email Removal Lists",
    detail: "Resolving verified privacy@ / dpo@ emails for 1-click Gmail removal",
  },
];

const COUNTRIES = [
  "United States",
  "United Kingdom",
  "Canada",
  "European Union",
  "India",
  "Australia",
  "Singapore",
  "United Arab Emirates",
  "Other",
];

type FormState = {
  fullName: string;
  city: string;
  region: string;
  country: string;
  emails: string;
  phones: string;
  usernames: string;
  customQuery: string;
};

const EMPTY_FORM: FormState = {
  fullName: "",
  city: "",
  region: "",
  country: "United States",
  emails: "",
  phones: "",
  usernames: "",
  customQuery: "",
};

export function ScanFlow({ initialEmail = "" }: { initialEmail?: string }) {
  const router = useRouter();
  const { saveScan } = useStore();
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, emails: initialEmail });
  const [useGemini, setUseGemini] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);

  const update = (key: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

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

  const finishScanAndNavigate = (scanResult: ScanResult) => {
    setProgress(100);
    saveScan(scanResult);
    window.setTimeout(() => {
      router.push("/dashboard?tab=swarm");
    }, 220);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!agreed) {
      setError("Please confirm the details are your own (or an authorized client's) before scanning.");
      return;
    }

    const phonesList = form.phones
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const emailsList = form.emails
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (phonesList.length === 0 && emailsList.length === 0 && form.fullName.trim().length < 2) {
      setError("Please enter at least one Phone Number or Email Address to pinpoint your data.");
      return;
    }

    if (emailsList.some((e) => !/\S+@\S+\.\S+/.test(e))) {
      setError("One of the email addresses doesn't look complete.");
      return;
    }

    setError("");
    setStatus("running");
    setProgress(8);

    const cleanProfile = {
      fullName:
        form.fullName.trim() ||
        emailsList[0]?.split("@")[0] ||
        phonesList[0] ||
        "Data Subject",
      city: form.city.trim() || form.country,
      region: form.region.trim(),
      country: form.country,
      emails: emailsList,
      phones: phonesList,
      usernames: form.usernames
        .split(",")
        .map((s) => s.trim().replace(/^@/, ""))
        .filter(Boolean),
    };

    try {
      if (useGemini) {
        const geminiResponse = await fetch("/api/swarm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile: cleanProfile,
            customQuery: form.customQuery.trim(),
          }),
        });

        const payload = (await geminiResponse.json().catch(() => ({}))) as {
          findings?: Finding[];
          reports?: SwarmAgentReport[];
          breaches?: BreachExposure[];
          checked?: number;
          error?: string;
        };

        if (!geminiResponse.ok) {
          throw new Error(
            payload.error || "Gemini 3.8 Flash encountered an error while finding your exposures."
          );
        }

        const findings = payload.findings ?? [];
        const reports = payload.reports ?? [];

        finishScanAndNavigate({
          id: `scan_${Date.now().toString(36)}`,
          createdAt: new Date().toISOString(),
          profile: cleanProfile,
          checked: payload.checked ?? Math.max(findings.length * 4, 24),
          findings,
          breaches: payload.breaches ?? [],
          swarmReports: reports,
          demo: false,
        });
        return;
      }

      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          fullName: cleanProfile.fullName,
          city: cleanProfile.city,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "The scan could not be completed.");
      }

      const payload = (await response.json()) as { scan: ScanResult };
      finishScanAndNavigate(payload.scan);
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Something interrupted the scan.");
    }
  };

  if (status === "running") {
    const stageIndex = Math.min(STAGES.length - 1, Math.floor(progress / 25));
    const currentStage = STAGES[stageIndex];
    const targetDisplay =
      form.phones.trim() || form.emails.trim() || form.fullName.trim();

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
                <Sparkles className="size-3.5 animate-pulse text-moss" />
                Gemini 3.8 Flash · Phone &amp; Email Pinpoint Search
              </p>
              <h2 className="mt-2 font-display text-[1.9rem] leading-tight">
                Pinpointing {targetDisplay} across the web.
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
            {STAGES.map((stage, index) => {
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
              {form.phones.trim() && (
                <div className="flex items-center justify-between text-ink-soft">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Phone className="size-3.5 text-moss" />
                    Target Phone(s)
                  </span>
                  <span className="truncate font-mono text-[0.7rem] text-ink">
                    {form.phones}
                  </span>
                </div>
              )}
              {form.emails.trim() && (
                <div className="flex items-center justify-between text-ink-soft">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Mail className="size-3.5 text-moss" />
                    Target Email(s)
                  </span>
                  <span className="truncate font-mono text-[0.7rem] text-ink">
                    {form.emails}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-muted">
                <span className="flex items-center gap-1.5">
                  <Globe className="size-3.5 text-moss" />
                  Region
                </span>
                <span className="text-moss-deep font-medium">
                  {[form.city, form.country].filter(Boolean).join(", ")}
                </span>
              </div>
            </div>

            <div className="mt-7 border-t border-line pt-5">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-moss" strokeWidth={1.7} aria-hidden />
                Instead of matching common names, Gemini 3.8 Flash pinpoints where your exact
                phone numbers and email addresses are posted and separates them into two
                dedicated removal lists.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-moss-soft/70 p-5">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-moss-deep">
              <ScanLine className="mt-0.5 size-4 shrink-0" strokeWidth={1.7} aria-hidden />
              Every discovered site includes a verified privacy@, dpo@, or grievance email
              so you can send deletion requests in one click.
            </p>
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
        <div className="space-y-5">
          {/* Primary Pinpoint Section: Phone Numbers & Email Addresses */}
          <div className="rounded-2xl border border-moss/30 bg-moss-soft/40 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-moss-deep">
                <Phone className="size-3.5 text-moss" />
                Pinpoint Identifiers (Zero Common-Name Duplicates)
              </span>
            </div>

            <div>
              <label className="label flex items-center gap-1.5" htmlFor="phones">
                <Phone className="size-3.5 text-moss" />
                Phone numbers to hunt across the internet <span className="text-clay">*</span>
              </label>
              <input
                id="phones"
                className="field bg-surface font-mono text-sm"
                value={form.phones}
                onChange={(event) => update("phones")(event.target.value)}
                placeholder="e.g. +91 98765 43210, +1 512 555 0134"
                autoComplete="tel"
                inputMode="tel"
              />
              <p className="mt-1.5 text-xs text-muted">
                Separate multiple numbers with commas. AI automatically checks all formats
                (with country code, local 10-digit, dashed, and unformatted) across caller-ID
                apps, reverse-phone lookups, and B2B databases.
              </p>
            </div>

            <div>
              <label className="label flex items-center gap-1.5" htmlFor="emails">
                <Mail className="size-3.5 text-moss" />
                Email addresses to hunt across the internet <span className="text-clay">*</span>
              </label>
              <input
                id="emails"
                className="field bg-surface font-mono text-sm"
                value={form.emails}
                onChange={(event) => update("emails")(event.target.value)}
                placeholder="you@example.com, work@company.com"
                autoComplete="email"
                inputMode="email"
              />
              <p className="mt-1.5 text-xs text-muted">
                Separate multiple emails with commas. AI builds a separate list of B2B contact
                brokers, lead lists, and directories exposing your email.
              </p>
            </div>
          </div>

          <div className="hairline my-6" />

          {/* Supporting Identity Context for Legal Deletion Notices */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
              Supporting Details (Used for Country Law &amp; Signing Removal Letters)
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="fullName">
                  Full name (for signing removal emails)
                </label>
                <input
                  id="fullName"
                  className="field"
                  value={form.fullName}
                  onChange={(event) => update("fullName")(event.target.value)}
                  placeholder="e.g. Owais Khan"
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="label" htmlFor="country">
                  Country
                </label>
                <div className="relative">
                  <select
                    id="country"
                    className="field appearance-none pr-10"
                    value={form.country}
                    onChange={(event) => update("country")(event.target.value)}
                  >
                    {COUNTRIES.map((country) => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="city">
                City (optional)
              </label>
              <input
                id="city"
                className="field"
                value={form.city}
                onChange={(event) => update("city")(event.target.value)}
                placeholder="e.g. Mumbai, Austin, London"
                autoComplete="address-level2"
              />
            </div>
            <div>
              <label className="label" htmlFor="usernames">
                Usernames / handles (optional)
              </label>
              <input
                id="usernames"
                className="field"
                value={form.usernames}
                onChange={(event) => update("usernames")(event.target.value)}
                placeholder="username1, username2"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="customQuery">
              Extra instructions for Gemini 3.8 Flash (optional)
            </label>
            <input
              id="customQuery"
              className="field"
              value={form.customQuery}
              onChange={(event) => update("customQuery")(event.target.value)}
              placeholder="e.g. find sites showing my mobile number, WhatsApp directories, B2B recruiter brokers"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-moss/30 bg-moss-soft/60 p-4">
            <input
              type="checkbox"
              checked={useGemini}
              onChange={(event) => setUseGemini(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-moss)]"
            />
            <span className="text-xs leading-relaxed text-ink-soft">
              <strong className="inline-flex items-center gap-1.5 font-medium text-moss-deep">
                <Sparkles className="size-3.5 text-moss" strokeWidth={1.8} aria-hidden />
                Pinpoint Phone &amp; Email AI Search (Gemini 3.8 Flash)
              </strong>
              <span className="mt-1 block text-muted">
                Searches specifically for your Phone Numbers and Email Addresses across the
                internet and organizes them into two separate removal lists so common names
                never cause duplicate results.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-mist/50 p-4">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-moss)]"
            />
            <span className="text-xs leading-relaxed text-ink-soft">
              These are my own phone numbers / emails (or I am authorized by my client) to
              request removal of these records.
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
            Find Phone &amp; Email Exposures
            <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
          </button>
          <span className="text-xs text-muted sm:ml-auto">
            Builds separate Phone &amp; Email removal lists (~3–5s)
          </span>
        </div>
      </div>

      <aside className="space-y-5">
        <div className="card p-6 md:p-7">
          <p className="text-[0.6875rem] uppercase tracking-[0.2em] text-muted">
            Why Pinpoint by Phone &amp; Email?
          </p>
          <ol className="mt-5 space-y-5">
            {[
              {
                icon: Phone,
                title: "1. Separate Phone Number List",
                body: "Finds caller-ID apps (Truecaller, Sync.me, Showcaller), reverse-phone books (USPhoneBook, NumLookup, SpyDialer, Justdial), and B2B mobile brokers (Lusha, SignalHire) exposing your exact number.",
              },
              {
                icon: Mail,
                title: "2. Separate Email Address List",
                body: "Finds B2B email brokers (ContactOut, RocketReach, Apollo, Hunter.io, Snov.io), prospect databases, and directories exposing your exact email address.",
              },
              {
                icon: MailCheck,
                title: "3. Exact-Match DPO Removal Emails",
                body: "Drafts legal deletion notices specifying your exact Phone Number and Email Address so data brokers delete the right record without name confusion.",
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
            Private &amp; under your control
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            Your scan results stay private to your browser or synced exclusively to your own
            authenticated account when signed in.
          </p>
        </div>
      </aside>
    </form>
  );
}
