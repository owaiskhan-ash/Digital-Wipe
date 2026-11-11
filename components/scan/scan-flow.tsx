"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Globe,
  Loader2,
  Lock,
  MailCheck,
  Radar,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { BreachExposure, Finding, ScanResult, SwarmAgentReport } from "@/lib/types";

const STAGES = [
  {
    label: "Agent 01 · Global Directory & Public Records Scout",
    detail: "Searching open-web people directories, caller-ID & regional registries",
  },
  {
    label: "Agent 02 · B2B, Lead-Gen & Broker Hunter",
    detail: "Querying commercial contact brokers, recruiter indexes & email lists",
  },
  {
    label: "Agent 03 · Open-Web Footprint & Archive Crawler",
    detail: "Scanning search engines, username scrapers, social mirrors & web caches",
  },
  {
    label: "Agent 04 · DPO & Privacy Contact Resolver",
    detail: "Resolving verified privacy@, dpo@, and grievance officer emails",
  },
  {
    label: "Swarm Coordinator · Synthesizing Removal Queue",
    detail: "Deduplicating web exposures & preparing 1-click Gmail deletion notices",
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
  const [useSwarm, setUseSwarm] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);

  const resultRef = useRef<ScanResult | null>(null);
  const finishing = useRef(false);

  const update = (key: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => {
      setProgress((current) =>
        Math.min(95, current + (useSwarm ? 0.85 : 1.8) + Math.random() * 1.3)
      );
    }, 120);
    return () => window.clearInterval(timer);
  }, [status, useSwarm]);

  useEffect(() => {
    if (status !== "running" || !resultRef.current || progress < 95) return;
    if (finishing.current) return;
    finishing.current = true;
    setProgress(100);
    const timer = window.setTimeout(() => {
      if (resultRef.current) saveScan(resultRef.current);
      router.push("/dashboard");
    }, 380);
    return () => window.clearTimeout(timer);
  }, [progress, status, saveScan, router]);

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
      setError("Please add a city so the agents can disambiguate common names.");
      return;
    }
    if (form.emails && !/\S+@\S+\.\S+/.test(form.emails)) {
      setError("That email address doesn't look complete.");
      return;
    }

    setError("");
    setStatus("running");
    setProgress(0);
    finishing.current = false;
    resultRef.current = null;

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
      if (useSwarm) {
        // Primary Open-Web AI Agent Swarm reconnaissance
        const swarmResponse = await fetch("/api/swarm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile: cleanProfile,
            customQuery: form.customQuery.trim(),
          }),
        });

        const swarmPayload = (await swarmResponse.json().catch(() => ({}))) as {
          findings?: Finding[];
          reports?: SwarmAgentReport[];
          breaches?: BreachExposure[];
          checked?: number;
          error?: string;
        };

        if (!swarmResponse.ok) {
          throw new Error(
            swarmPayload.error || "The AI Agent Swarm encountered an error while scanning the web."
          );
        }

        const swarmFindings = swarmPayload.findings ?? [];
        const swarmReports = swarmPayload.reports ?? [];

        resultRef.current = {
          id: `scan_${Date.now().toString(36)}`,
          createdAt: new Date().toISOString(),
          profile: cleanProfile,
          checked: swarmPayload.checked ?? Math.max(swarmFindings.length * 4, 24),
          findings: swarmFindings,
          breaches: swarmPayload.breaches ?? [],
          swarmReports,
          demo: false,
        };
        setProgress((current) => Math.max(current, 95));
        return;
      }

      // Fallback static directory scan if user unchecked AI Agent Swarm
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
      resultRef.current = payload.scan;
      setProgress((current) => Math.max(current, 95));
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Something interrupted the scan.");
    }
  };

  if (status === "running") {
    const stageIndex = Math.min(STAGES.length - 1, Math.floor(progress / 20));
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
                <Radar className="size-3.5 animate-spin text-moss" />
                {useSwarm ? "Open-Web AI Agent Swarm Active" : "Scanning"}
              </p>
              <h2 className="mt-2 font-display text-[1.9rem] leading-tight">
                {useSwarm
                  ? `Searching the open web for ${form.fullName.trim()}.`
                  : "Looking for you, quietly."}
              </h2>
            </div>
            <span className="font-display text-3xl tabular-nums text-moss">
              {Math.round(progress)}%
            </span>
          </div>

          <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-mist">
            <div
              className="h-full rounded-full bg-moss transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <ol className="mt-8 space-y-4">
            {STAGES.map((stage, index) => {
              const done = progress >= (index + 1) * 20;
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
              Active Reconnaissance Task
            </p>
            <p className="mt-3 font-display text-[1.55rem] leading-tight">
              {currentStage.label}
            </p>
            <p className="mt-1.5 text-xs text-muted">{currentStage.detail}</p>

            <div className="mt-7 rounded-xl border border-line bg-mist/60 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between text-ink-soft">
                <span className="flex items-center gap-1.5 font-medium">
                  <Globe className="size-3.5 text-moss" />
                  Target Identity
                </span>
                <span className="truncate font-mono text-[0.7rem] text-ink">
                  {form.fullName} · {form.city}, {form.country}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted">
                <span>Search Scope</span>
                <span className="text-moss-deep font-medium">Entire Open Internet (Google Grounded)</span>
              </div>
            </div>

            <div className="mt-7 border-t border-line pt-5">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                <Bot className="mt-0.5 size-3.5 shrink-0 text-moss" strokeWidth={1.7} aria-hidden />
                4 specialized Gemini AI agents are querying Google Search in parallel to find
                websites holding this person&apos;s data and resolve each site&apos;s privacy officer
                (DPO) email address.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-moss-soft/70 p-5">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-moss-deep">
              <ScanLine className="mt-0.5 size-4 shrink-0" strokeWidth={1.7} aria-hidden />
              Not limited to fixed directories—our agents discover regional databases, caller-ID
              apps, B2B lead brokers, and web archives anywhere on the internet.
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
              Guides regional web discovery and sets the privacy law (GDPR, CCPA, DPDP) cited in
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
              Separate with commas. Used by the B2B &amp; Breach agents to locate exposed contact
              profiles.
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
              Extra search hints for AI Agents (optional)
            </label>
            <input
              id="customQuery"
              className="field"
              value={form.customQuery}
              onChange={(event) => update("customQuery")(event.target.value)}
              placeholder="e.g. company name, profession, old city, or specific website"
            />
            <p className="mt-1.5 text-xs text-muted">
              Helps the AI Swarm narrow down results across the internet for common names.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-moss/30 bg-moss-soft/60 p-4">
            <input
              type="checkbox"
              checked={useSwarm}
              onChange={(event) => setUseSwarm(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-moss)]"
            />
            <span className="text-xs leading-relaxed text-ink-soft">
              <strong className="inline-flex items-center gap-1.5 font-medium text-moss-deep">
                <Sparkles className="size-3.5 text-moss" strokeWidth={1.8} aria-hidden />
                Open-Web AI Agent Swarm (Searches Across the Entire Internet)
              </strong>
              <span className="mt-1 block text-muted">
                Deploys 4 Gemini AI agents with live Google Search grounding to find websites,
                directories, B2B databases, and public archives anywhere on the internet—and
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
            {useSwarm ? "Deploy AI Agent Swarm" : "Run directory scan"}
            <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
          </button>
          <span className="text-xs text-muted sm:ml-auto">
            {useSwarm ? "Live Google Search across the internet (~10–15s)" : "About 5 seconds"}
          </span>
        </div>
      </div>

      <aside className="space-y-5">
        <div className="card p-6 md:p-7">
          <p className="text-[0.6875rem] uppercase tracking-[0.2em] text-muted">
            How the AI Swarm works
          </p>
          <ol className="mt-5 space-y-5">
            {[
              {
                icon: Bot,
                title: "4 Agents Search the Whole Web",
                body: "Not restricted to 45 sites—agents search Google live for global & regional directories, caller-ID apps, B2B lead brokers, and web archives.",
              },
              {
                icon: ShieldCheck,
                title: "Resolves DPO & Privacy Emails",
                body: "For every site discovered, our DPO Resolver agent finds the official privacy@, dpo@, or grievance officer email address.",
              },
              {
                icon: MailCheck,
                title: "1-Click Gmail Removal Queue",
                body: "Generates legal deletion emails (GDPR, CCPA, DPDP) for every discovered site so you can send them straight from your connected Gmail.",
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
