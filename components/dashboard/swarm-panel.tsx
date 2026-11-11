"use client";

import { useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  Finding,
  Profile,
  RequestStatus,
  SwarmAgentReport,
} from "@/lib/types";
import { DATA_LABELS } from "@/lib/types";
import { plural } from "@/lib/utils";
import { CategoryPill, RiskBadge } from "@/components/ui";
import type { ComposerSeed } from "./composer";

function buildGlobalPhoneGoogleUrl(phones: string[]): string {
  const raw = phones[0] || "";
  const digits = raw.replace(/\D/g, "");
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  const terms = Array.from(
    new Set(
      [
        raw.trim(),
        last10,
        last10.length === 10 ? `${last10.slice(0, 5)} ${last10.slice(5)}` : "",
        last10.length === 10
          ? `${last10.slice(0, 3)}-${last10.slice(3, 6)}-${last10.slice(6)}`
          : "",
      ].filter(Boolean)
    )
  );
  const query = terms.map((t) => `"${t}"`).join(" OR ");
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildGlobalEmailGoogleUrl(emails: string[]): string {
  const query = emails.map((e) => `"${e.trim()}"`).join(" OR ");
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function SwarmPanel({
  profile,
  findings,
  swarmReports = [],
  statuses,
  onMergeSwarmResults,
  onCompose,
  onToast,
}: {
  profile: Profile;
  findings: Finding[];
  swarmReports?: SwarmAgentReport[];
  statuses: Record<string, RequestStatus>;
  onMergeSwarmResults: (newFindings: Finding[], reports: SwarmAgentReport[]) => void;
  onCompose: (seeds: ComposerSeed[]) => void;
  onToast: (msg: string) => void;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState(profile.phones.join(", "));
  const [emailInput, setEmailInput] = useState(profile.emails.join(", "));
  const [customQuery, setCustomQuery] = useState("");

  // Separate Phone Number exposures vs Email Address exposures
  const phoneFindings = findings.filter(
    (f) =>
      f.matchType === "phone" ||
      (!f.matchType &&
        Boolean(f.discoveredByAgent) &&
        f.data.includes("phone") &&
        !f.data.includes("email"))
  );

  const emailFindings = findings.filter(
    (f) =>
      f.matchType === "email" ||
      (!f.matchType && Boolean(f.discoveredByAgent) && !phoneFindings.includes(f))
  );

  const runPinpointSearch = async () => {
    setRunning(true);
    setError(null);

    const updatedPhones = phoneInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const updatedEmails = emailInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const searchProfile: Profile = {
      ...profile,
      phones: updatedPhones.length > 0 ? updatedPhones : profile.phones,
      emails: updatedEmails.length > 0 ? updatedEmails : profile.emails,
    };

    try {
      const response = await fetch("/api/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: searchProfile,
          existingDomains: findings.map((f) => f.domain),
          customQuery: customQuery.trim(),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        findings?: Finding[];
        reports?: SwarmAgentReport[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error || "Gemini 3.8 Flash encountered an error while searching."
        );
      }

      const discovered = data.findings ?? [];
      const reports = data.reports ?? [];
      onMergeSwarmResults(discovered, reports);
      onToast(
        discovered.length > 0
          ? `Found ${plural(discovered.length, "Phone & Email exposure")} with verified removal emails.`
          : "Completed pinpoint Phone & Email scan."
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not complete the Phone & Email scan. Please try again."
      );
    } finally {
      setRunning(false);
    }
  };

  const activePhones = phoneInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const activeEmails = emailInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="space-y-8">
      {/* Pinpoint Phone & Email Control Header */}
      <div className="card overflow-hidden border-moss/30">
        <div className="bg-moss-soft/50 px-6 py-6 md:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-moss/25 bg-surface px-3 py-1 text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-moss-deep">
                <Sparkles className="size-3.5 text-moss" />
                Gemini 3.8 Flash · Pinpoint Phone &amp; Email Hunter
              </div>
              <h2 className="mt-3 text-[1.75rem] leading-tight text-ink sm:text-[2rem]">
                Separate Phone Number &amp; Email Removal Lists
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft sm:text-sm">
                Common names produce duplicate results. Gemini 3.8 Flash pinpoints websites
                specifically by your <strong>Phone Numbers</strong> and{" "}
                <strong>Email Addresses</strong> and builds two separate lists ready for
                1-click Gmail removal.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={runPinpointSearch}
                disabled={running}
                className="btn btn-primary flex items-center gap-2"
              >
                {running ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Hunting Phone &amp; Email across web...
                  </>
                ) : phoneFindings.length > 0 || emailFindings.length > 0 || swarmReports.length > 0 ? (
                  <>
                    <RefreshCw className="size-4" strokeWidth={1.8} />
                    Scan Phone &amp; Email Again
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" strokeWidth={1.8} />
                    Find Phone &amp; Email Exposures
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Editable Phone + Email Pinpoint Inputs */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink">
                <Phone className="size-3.5 text-moss" />
                Phone Number(s) to Pinpoint
              </label>
              <input
                type="text"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="e.g. +91 98765 43210, +1 512 555 0134"
                className="field bg-surface font-mono text-xs"
                disabled={running}
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink">
                <Mail className="size-3.5 text-moss" />
                Email Address(es) to Pinpoint
              </label>
              <input
                type="text"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="e.g. you@gmail.com, work@company.com"
                className="field bg-surface font-mono text-xs"
                disabled={running}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                strokeWidth={1.8}
              />
              <input
                type="text"
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !running) {
                    e.preventDefault();
                    runPinpointSearch();
                  }
                }}
                placeholder="Optional extra hint (e.g. caller-ID apps, WhatsApp directories, B2B recruiter brokers, India directories)..."
                className="field bg-surface pl-10 text-xs"
                disabled={running}
              />
            </div>

            {/* Direct Live Google Exact-Match Dork Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {activePhones.length > 0 && (
                <a
                  href={buildGlobalPhoneGoogleUrl(activePhones)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-xs flex items-center gap-1.5"
                  title="Open live Google exact-match search for all formats of your phone number"
                >
                  <Globe className="size-3.5 text-moss" />
                  Live Google Phone Search
                  <ExternalLink className="size-3" />
                </a>
              )}
              {activeEmails.length > 0 && (
                <a
                  href={buildGlobalEmailGoogleUrl(activeEmails)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-xs flex items-center gap-1.5"
                  title="Open live Google exact-match search for your email address"
                >
                  <Globe className="size-3.5 text-moss" />
                  Live Google Email Search
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-clay/30 bg-clay-soft px-4 py-3 text-xs text-clay">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── SEPARATE LIST 1: PHONE NUMBER EXPOSURES ──────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-moss/30 bg-surface p-5">
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-moss/25 bg-moss-soft text-moss-deep">
              <Phone className="size-5" strokeWidth={1.8} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-medium text-ink">
                  1. Phone Number Exposure List ({phoneFindings.length})
                </h3>
                {activePhones.map((p) => (
                  <span
                    key={p}
                    className="rounded-md border border-moss/30 bg-moss-soft px-2 py-0.5 font-mono text-xs font-medium text-moss-deep"
                  >
                    {p}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">
                Caller-ID apps, reverse-phone lookup directories, WhatsApp/mobile indexes,
                and direct-dial brokers exposing your phone number—with verified privacy
                removal emails.
              </p>
            </div>
          </div>

          {phoneFindings.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onCompose(phoneFindings.map((finding) => ({ finding })))
              }
              className="btn btn-primary btn-sm shrink-0"
            >
              <Send className="size-3.5" strokeWidth={1.8} />
              Email All {phoneFindings.length} Phone Sites
            </button>
          )}
        </div>

        {phoneFindings.length > 0 ? (
          <div className="grid gap-3">
            {phoneFindings.map((finding) => (
              <PinpointFindingCard
                key={finding.id}
                finding={finding}
                status={statuses[finding.id]}
                badgeLabel={finding.matchedValue || activePhones[0] || "Phone Exposure"}
                badgeType="phone"
                onCompose={() => onCompose([{ finding }])}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface/50 p-6 text-center text-xs text-muted">
            Enter your phone number above and click{" "}
            <strong className="text-ink">Find Phone &amp; Email Exposures</strong> to
            build your dedicated Phone Number removal list.
          </div>
        )}
      </section>

      {/* ── SEPARATE LIST 2: EMAIL ADDRESS EXPOSURES ─────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-strong bg-surface p-5">
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-mist text-ink">
              <Mail className="size-5 text-moss" strokeWidth={1.8} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-medium text-ink">
                  2. Email Address Exposure List ({emailFindings.length})
                </h3>
                {activeEmails.map((e) => (
                  <span
                    key={e}
                    className="rounded-md border border-line-strong bg-mist px-2 py-0.5 font-mono text-xs font-medium text-ink"
                  >
                    {e}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">
                B2B contact brokers, recruiter tools, email enrichment databases, and
                prospect directories exposing your email address—kept completely separate
                from phone and name results.
              </p>
            </div>
          </div>

          {emailFindings.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onCompose(emailFindings.map((finding) => ({ finding })))
              }
              className="btn btn-primary btn-sm shrink-0"
            >
              <Send className="size-3.5" strokeWidth={1.8} />
              Email All {emailFindings.length} Email Sites
            </button>
          )}
        </div>

        {emailFindings.length > 0 ? (
          <div className="grid gap-3">
            {emailFindings.map((finding) => (
              <PinpointFindingCard
                key={finding.id}
                finding={finding}
                status={statuses[finding.id]}
                badgeLabel={finding.matchedValue || activeEmails[0] || "Email Exposure"}
                badgeType="email"
                onCompose={() => onCompose([{ finding }])}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface/50 p-6 text-center text-xs text-muted">
            Enter your email address above and click{" "}
            <strong className="text-ink">Find Phone &amp; Email Exposures</strong> to
            build your dedicated Email Address removal list.
          </div>
        )}
      </section>

      {/* Footer note */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-muted">
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-moss" />
          Every removal email automatically specifies your exact Phone Number and Email
          Address so data brokers delete the exact record without confusing you with
          anyone sharing your name.
        </span>
      </div>
    </div>
  );
}

function PinpointFindingCard({
  finding,
  status,
  badgeLabel,
  badgeType,
  onCompose,
}: {
  finding: Finding;
  status?: RequestStatus;
  badgeLabel: string;
  badgeType: "phone" | "email";
  onCompose: () => void;
}) {
  return (
    <article className="card p-5 transition-colors hover:border-line-strong">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-moss/30 bg-moss-soft px-2.5 py-0.5 font-mono text-[0.7rem] font-medium text-moss-deep">
              {badgeType === "phone" ? (
                <Phone className="size-3" />
              ) : (
                <Mail className="size-3" />
              )}
              {badgeLabel}
            </span>
            <h4 className="text-base font-medium text-ink">{finding.broker}</h4>
            <span className="text-xs text-muted">{finding.domain}</span>
            <RiskBadge risk={finding.risk} />
            {status && (
              <span className="rounded-full border border-moss/30 bg-moss-soft px-2.5 py-0.5 text-[0.6875rem] font-medium text-moss-deep">
                {status === "sent"
                  ? "Email Sent"
                  : status === "drafted"
                    ? "Draft Saved"
                    : status}
              </span>
            )}
          </div>

          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            {finding.summary}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <CategoryPill category={finding.category} />
            {finding.data
              .filter((t) => t !== "fullName")
              .slice(0, 5)
              .map((type) => (
                <span
                  key={type}
                  className="rounded-md border border-line bg-mist px-1.5 py-0.5 text-[0.6875rem] text-ink-soft"
                >
                  {DATA_LABELS[type]}
                </span>
              ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5 font-medium text-ink-soft">
              <Mail className="size-3.5 text-moss" />
              Removal Email:{" "}
              <span className="font-mono text-moss-deep">
                {finding.contactEmail || `privacy@${finding.domain}`}
              </span>
            </span>
            {finding.note && (
              <span className="text-[0.7rem] text-muted">
                Tip: {finding.note}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <button
            type="button"
            onClick={onCompose}
            className="btn btn-primary btn-xs flex items-center gap-1.5"
          >
            <Send className="size-3" strokeWidth={1.8} />
            Review &amp; Send Email
          </button>

          <div className="flex items-center gap-2">
            <a
              href={finding.inspectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-quiet btn-xs text-muted"
              title="Search this exact phone/email on this website via Google"
            >
              Verify on site
              <ExternalLink className="size-3" />
            </a>
            <a
              href={finding.removalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-quiet btn-xs text-muted"
            >
              Opt-out page
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
