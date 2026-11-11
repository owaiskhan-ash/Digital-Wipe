"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Loader2,
  Lock,
  MailCheck,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { BROKERS } from "@/lib/brokers";
import { useStore } from "@/lib/store";
import type { Finding, ScanResult, SwarmAgentReport } from "@/lib/types";

const STAGES = [
  { label: "Reading your profile", detail: "Name, place, contact points" },
  { label: "Querying people-search directories", detail: "20 directories" },
  { label: "Deploying AI Agent Swarm across the web", detail: "Live Google Search + DPO email lookup" },
  { label: "Scanning marketing & breach archives", detail: "17 data brokers & breach logs" },
  { label: "Scoring, deduplicating & drafting removals", detail: "Risk, effort, privacy contact emails" },
];

const COUNTRIES = [
  "United States",
  "United Kingdom",
  "Canada",
  "European Union",
  "India",
  "Australia",
  "Singapore",
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
};

const EMPTY_FORM: FormState = {
  fullName: "",
  city: "",
  region: "",
  country: "United States",
  emails: "",
  phones: "",
  usernames: "",
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

  // Gentle progress while the request is in flight; it never stalls at 100%
  // before the result is actually in hand.
  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(96, current + (useSwarm ? 0.65 : 1.4) + Math.random() * 1.4));
    }, 100);
    return () => window.clearInterval(timer);
  }, [status, useSwarm]);

  useEffect(() => {
    if (status !== "running" || !resultRef.current || progress < 96) return;
    if (finishing.current) return;
    finishing.current = true;
    setProgress(100);
    const timer = window.setTimeout(() => {
      if (resultRef.current) saveScan(resultRef.current);
      router.push("/dashboard");
    }, 420);
    return () => window.clearTimeout(timer);
  }, [progress, status, saveScan, router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!agreed) {
      setError("Please confirm the details are your own before scanning.");
      return;
    }
    if (form.fullName.trim().length < 2) {
      setError("Please add your full name.");
      return;
    }
    if (form.city.trim().length < 2) {
      setError("Please add your city, since almost every listing is keyed to a place.");
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

    try {
      const scanPromise = fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });

      const swarmPromise = useSwarm
        ? fetch("/api/swarm", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              profile: {
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
              },
            }),
          }).catch(() => null)
        : Promise.resolve(null);

      const [response, swarmResponse] = await Promise.all([scanPromise, swarmPromise]);

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "The scan could not be completed.");
      }

      const payload = (await response.json()) as { scan: ScanResult };
      let finalScan: ScanResult = payload.scan;

      if (swarmResponse && swarmResponse.ok) {
        const swarmData = (await swarmResponse.json().catch(() => null)) as {
          reports?: SwarmAgentReport[];
          findings?: Finding[];
        } | null;

        if (swarmData) {
          const existingDomains = new Set(
            finalScan.findings.map((f) => f.domain.toLowerCase()),
          );
          const uniqueNewFindings = (swarmData.findings ?? []).filter(
            (nf) => !existingDomains.has(nf.domain.toLowerCase()),
          );
          finalScan = {
            ...finalScan,
            checked: finalScan.checked + uniqueNewFindings.length,
            findings: [...uniqueNewFindings, ...finalScan.findings],
            swarmReports: swarmData.reports ?? [],
          };
        }
      }

      resultRef.current = finalScan;
      // Let the progress settle close to the end before finishing.
      setProgress((current) => Math.max(current, 96));
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Something interrupted the scan.");
    }
  };

  if (status === "running") {
    const stageIndex = Math.min(STAGES.length - 1, Math.floor(progress / 20));
    const brokerIndex = Math.min(
      BROKERS.length - 1,
      Math.floor((progress / 100) * BROKERS.length),
    );
    const broker = BROKERS[brokerIndex];

    return (
      <div
        className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]"
        role="status"
        aria-live="polite"
      >
        <div className="card p-7 md:p-9">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[0.6875rem] uppercase tracking-[0.2em] text-muted">
                {useSwarm ? "Directory Scan + AI Agent Swarm" : "Scanning"}
              </p>
              <h2 className="mt-2 font-display text-[1.9rem] leading-tight">
                {useSwarm ? "4 AI agents are searching the live web." : "Looking for you, quietly."}
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
                        done || active ? "text-ink" : "text-muted",
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
              Currently checking
            </p>
            <p className="mt-3 font-display text-[1.7rem] leading-tight">{broker.name}</p>
            <p className="mt-1 text-xs text-muted">{broker.domain}</p>

            <div className="mt-8 flex items-baseline gap-1.5">
              <span className="font-display text-[2.6rem] leading-none tabular-nums">
                {String(Math.min(brokerIndex + 1, BROKERS.length)).padStart(2, "0")}
              </span>
              <span className="text-sm text-muted">
                / {BROKERS.length} brokers {useSwarm ? "+ Live Web AI Swarm" : "sources"}
              </span>
            </div>

            <div className="mt-8 border-t border-line pt-5">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                <Bot className="mt-0.5 size-3.5 shrink-0 text-moss" strokeWidth={1.7} aria-hidden />
                {useSwarm
                  ? "Our 4 specialized AI agents are searching Google and resolving privacy officer (DPO) emails for your removal queue."
                  : "Matching your name against known directories and sorting what comes back by risk."}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-moss-soft/70 p-5">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-moss-deep">
              <ScanLine className="mt-0.5 size-4 shrink-0" strokeWidth={1.7} aria-hidden />
              Matching your name against each directory&apos;s public index, then
              sorting what comes back by how personal it is.
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
              The version that appears in public records.
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
              Sets the law your deletion request cites.
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
              placeholder="you@example.com, work@example.com"
              autoComplete="email"
              inputMode="email"
            />
            <p className="mt-1.5 text-xs text-muted">
              Separate with commas. Used for marketing lists and breach checks.
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
                Usernames
              </label>
              <input
                id="usernames"
                className="field"
                value={form.usernames}
                onChange={(event) => update("usernames")(event.target.value)}
                placeholder="mayakapoor, mkstudio"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted">
            Optional. Handles without the @. Leave anything blank you&apos;d rather
            not share.
          </p>

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
                Deploy AI Agent Swarm (Live Web Search)
              </strong>
              <span className="mt-1 block text-muted">
                Dispatches 4 specialized AI agents across Google Search to discover public listings, B2B profiles, social caches, and official privacy officer (DPO) emails so you can send removal emails right away.
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
              These are my own details, and I&apos;m asking for my own records to be
              removed.
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
            {useSwarm ? "Run scan + AI Agent Swarm" : "Run the scan"}
            <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
          </button>
          <span className="text-xs text-muted sm:ml-auto">
            {useSwarm ? "About 10–15 seconds (live web search)" : "About 5 seconds"}
          </span>
        </div>
      </div>

      <aside className="space-y-5">
        <div className="card p-6 md:p-7">
          <p className="text-[0.6875rem] uppercase tracking-[0.2em] text-muted">
            What happens next
          </p>
          <ol className="mt-5 space-y-5">
            {[
              {
                icon: Bot,
                title: "AI Agent Swarm + 45 Brokers",
                body: "4 AI agents search Google in real time alongside our 45-broker directory to find exposed profiles and privacy contacts.",
              },
              {
                icon: ShieldCheck,
                title: "You get an actionable removal list",
                body: "Every listing comes with what it exposes, who owns it, and their resolved privacy/DPO email address.",
              },
              {
                icon: MailCheck,
                title: "Send removal emails in one click",
                body: "One deletion request per owner, citing GDPR, CCPA, or DPDP. Send directly from your connected Gmail.",
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
            Your scan results stay private to your browser or synced exclusively to your own encrypted account when signed in.
          </p>
        </div>
      </aside>
    </form>
  );
}
