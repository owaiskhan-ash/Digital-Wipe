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
  MailCheck,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { BreachExposure, Finding, ScanResult, SwarmAgentReport } from "@/lib/types";

const STAGES = [
  {
    label: "Step 01 · Understanding Search Intent",
    detail: "Preparing your identity markers, region, and custom search instructions",
  },
  {
    label: "Step 02 · Gemini 3.8 Flash Web Discovery",
    detail: "Finding people-search sites, caller-ID apps, B2B brokers & public directories",
  },
  {
    label: "Step 03 · Resolving Privacy & DPO Emails",
    detail: "Matching each website with its verified privacy@, dpo@, or grievance email",
  },
  {
    label: "Step 04 · Preparing 1-Click Removal Queue",
    detail: "Drafting statutory deletion notices (GDPR, CCPA, DPDP) ready for Gmail",
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
      router.push("/dashboard");
    }, 220);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!agreed) {
      setError("Please confirm the details are your own (or an authorized client's) before scanning.");
      return;
    }
    if (form.fullName.trim().length < 2) {
      setError("Please add the full name to search for.");
      return;
    }
    if (form.city.trim().length < 2) {
      setError("Please add a city so Gemini can disambiguate common names.");
      return;
    }
    if (form.emails && !/\S+@\S+\.\S+/.test(form.emails)) {
      setError("That email address doesn't look complete.");
      return;
    }

    setError("");
    setStatus("running");
    setProgress(8);

    const cleanProfile = {
      fullName: form.fullName.trim(),
      city: form.city.trim(),
      region: form.region.trim(),
      country: form.country,
      emails: form.emails
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      phones: form.phones
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
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
        body: JSON.stringify(form),
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
                {useGemini ? "Gemini 3.8 Flash Active" : "Scanning"}
              </p>
              <h2 className="mt-2 font-display text-[1.9rem] leading-tight">
                Finding exposures for {form.fullName.trim()}.
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
              <div className="flex items-center justify-between text-ink-soft">
                <span className="flex items-center gap-1.5 font-medium">
                  <Globe className="size-3.5 text-moss" />
                  Target Profile
                </span>
                <span className="truncate font-mono text-[0.7rem] text-ink">
                  {form.fullName} · {form.city}, {form.country}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted">
                <span>AI Engine</span>
                <span className="text-moss-deep font-medium">Gemini 3.8 Flash</span>
              </div>
            </div>

            <div className="mt-7 border-t border-line pt-5">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-moss" strokeWidth={1.7} aria-hidden />
                Gemini 3.8 Flash is finding the directories, caller-ID databases, and B2B
                contact brokers that match your search intent and resolving each site&apos;s
                privacy officer email.
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
          <div>
            <label className="label" htmlFor="fullName">
              Full name <span className="text-clay">*</span>
            </label>
            <input
              id="fullName"
              className="field"
              value={form.fullName}
              onChange={(event) => update("fullName")(event.target.value)}
              placeholder="e.g. John Smith"
              autoComplete="name"
              required
            />
            <p className="mt-1.5 text-xs text-muted">
              Your name or your client&apos;s full name as it appears on public records.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="city">
                City <span className="text-clay">*</span>
              </label>
              <input
                id="city"
                className="field"
                value={form.city}
                onChange={(event) => update("city")(event.target.value)}
                placeholder="Austin"
                autoComplete="address-level2"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="region">
                State / region
              </label>
              <input
                id="region"
                className="field"
                value={form.region}
                onChange={(event) => update("region")(event.target.value)}
                placeholder="Texas"
                autoComplete="address-level1"
              />
            </div>
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
            <p className="mt-1.5 text-xs text-muted">
              Guides regional discovery and sets the privacy law (GDPR, CCPA, DPDP) cited in
              removal emails.
            </p>
          </div>

          <div className="hairline my-7" />

          <div>
            <label className="label" htmlFor="emails">
              Email addresses
            </label>
            <input
              id="emails"
              className="field"
              value={form.emails}
              onChange={(event) => update("emails")(event.target.value)}
              placeholder="you@example.com, work@company.com"
              autoComplete="email"
              inputMode="email"
            />
            <p className="mt-1.5 text-xs text-muted">
              Separate with commas. Helps locate exposed B2B and directory profiles.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="phones">
                Phone numbers
              </label>
              <input
                id="phones"
                className="field"
                value={form.phones}
                onChange={(event) => update("phones")(event.target.value)}
                placeholder="+1 512 555 0134"
                autoComplete="tel"
                inputMode="tel"
              />
            </div>
            <div>
              <label className="label" htmlFor="usernames">
                Usernames / handles
              </label>
              <input
                id="usernames"
                className="field"
                value={form.usernames}
                onChange={(event) => update("usernames")(event.target.value)}
                placeholder="johnsmith, jsmithdev"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="customQuery">
              What are you looking to find or remove? (optional)
            </label>
            <input
              id="customQuery"
              className="field"
              value={form.customQuery}
              onChange={(event) => update("customQuery")(event.target.value)}
              placeholder="e.g. phone directories, B2B work email brokers, company name, or specific websites"
            />
            <p className="mt-1.5 text-xs text-muted">
              Tell Gemini 3.8 Flash exactly what kind of exposure or context you want it to
              prioritize.
            </p>
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
                Powered by Gemini 3.8 Flash (Fast Open-Web Discovery)
              </strong>
              <span className="mt-1 block text-muted">
                Uses a single fast Gemini 3.8 Flash pass to find the websites, people
                directories, caller-ID databases, and B2B brokers exposing your data—and
                resolves each company&apos;s privacy/DPO email for 1-click removal.
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
              These are my own details (or I am authorized by my client) to request removal of
              these records.
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
            {useGemini ? "Find Exposures with Gemini 3.8 Flash" : "Run directory scan"}
            <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
          </button>
          <span className="text-xs text-muted sm:ml-auto">
            {useGemini ? "Fast single-pass AI search (~3–5 seconds)" : "About 5 seconds"}
          </span>
        </div>
      </div>

      <aside className="space-y-5">
        <div className="card p-6 md:p-7">
          <p className="text-[0.6875rem] uppercase tracking-[0.2em] text-muted">
            How Gemini 3.8 Flash works
          </p>
          <ol className="mt-5 space-y-5">
            {[
              {
                icon: Search,
                title: "Finds What You Are Looking For",
                body: "Searches across regional & global people directories, caller-ID apps, B2B contact brokers, and public records tailored to your country and search hints.",
              },
              {
                icon: ShieldCheck,
                title: "Resolves DPO & Privacy Emails",
                body: "For every website found, Gemini provides the official privacy@, dpo@, or grievance officer email address.",
              },
              {
                icon: MailCheck,
                title: "1-Click Gmail Removal Queue",
                body: "Generates legal deletion emails (GDPR, CCPA, DPDP) for every discovered site so you can send them straight from your Gmail.",
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
