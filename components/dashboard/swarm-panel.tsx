"use client";

import { useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  Mail,
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
  const [customQuery, setCustomQuery] = useState("");

  const aiFindings = findings.filter((f) => Boolean(f.discoveredByAgent));

  const runGeminiSearch = async () => {
    setRunning(true);
    setError(null);

    try {
      const response = await fetch("/api/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
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
          ? `Gemini 3.8 Flash found ${plural(discovered.length, "removal target")} with privacy emails.`
          : "Gemini 3.8 Flash completed your search."
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not complete the Gemini 3.8 Flash search. Please try again."
      );
    } finally {
      setRunning(false);
    }
  };

  const unrequestedAiFindings = aiFindings.filter((f) => !statuses[f.id]);

  return (
    <div className="space-y-6">
      {/* Gemini 3.8 Flash Search Header */}
      <div className="card overflow-hidden border-moss/30">
        <div className="bg-moss-soft/50 px-6 py-6 md:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-moss/25 bg-surface px-3 py-1 text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-moss-deep">
                <Sparkles className="size-3.5 text-moss" />
                Powered by Gemini 3.8 Flash
              </div>
              <h2 className="mt-3 text-[1.75rem] leading-tight text-ink sm:text-[2rem]">
                Find &amp; Remove Exposures for{" "}
                <span className="text-moss-deep">{profile.fullName}</span>
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft sm:text-sm">
                Tell Gemini 3.8 Flash what you want to look for—people directories,
                caller-ID databases, B2B work email brokers, or regional registries—and
                get a ready-to-send removal list with each site&apos;s privacy officer email.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {aiFindings.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onCompose(
                      (unrequestedAiFindings.length > 0
                        ? unrequestedAiFindings
                        : aiFindings
                      ).map((finding) => ({ finding }))
                    )
                  }
                  className="btn btn-secondary btn-sm"
                >
                  <Mail className="size-4 text-moss" strokeWidth={1.8} />
                  Email all {aiFindings.length} targets
                </button>
              )}

              <button
                type="button"
                onClick={runGeminiSearch}
                disabled={running}
                className="btn btn-primary flex items-center gap-2"
              >
                {running ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Gemini 3.8 Flash searching...
                  </>
                ) : swarmReports.length > 0 || aiFindings.length > 0 ? (
                  <>
                    <RefreshCw className="size-4" strokeWidth={1.8} />
                    Find More with Gemini 3.8 Flash
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" strokeWidth={1.8} />
                    Search with Gemini 3.8 Flash
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
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
                    runGeminiSearch();
                  }
                }}
                placeholder="What are you looking to find? (e.g. phone number directories, B2B email brokers, employer, or specific sites)..."
                className="field bg-surface pl-10 text-xs"
                disabled={running}
              />
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

      {/* Actionable Removal Email List Built by Gemini 3.8 Flash */}
      {aiFindings.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <div>
              <h3 className="text-xl text-ink">
                Gemini 3.8 Flash Removal List ({aiFindings.length})
              </h3>
              <p className="text-xs text-muted">
                Every website below includes a resolved privacy contact email so you can
                review and dispatch deletion requests directly via Gmail.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                onCompose(aiFindings.map((finding) => ({ finding })))
              }
              className="btn btn-primary btn-sm"
            >
              <Send className="size-3.5" strokeWidth={1.8} />
              Draft &amp; Send All ({aiFindings.length})
            </button>
          </div>

          <div className="grid gap-3">
            {aiFindings.map((finding) => {
              const status = statuses[finding.id];
              return (
                <article
                  key={finding.id}
                  className="card p-5 transition-colors hover:border-line-strong"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md border border-moss/25 bg-moss-soft px-2 py-0.5 text-[0.6875rem] font-medium text-moss-deep">
                          <Sparkles className="size-3" />
                          Gemini 3.8 Flash
                        </span>
                        <h4 className="text-base font-medium text-ink">
                          {finding.broker}
                        </h4>
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
                          To: {finding.contactEmail || `privacy@${finding.domain}`}
                        </span>
                        {finding.note && (
                          <span className="text-[0.7rem] text-muted">
                            Note: {finding.note}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                      <button
                        type="button"
                        onClick={() => onCompose([{ finding }])}
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
                        >
                          Inspect
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
            })}
          </div>
        </div>
      ) : (
        !running && (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center">
            <div className="mx-auto grid size-11 place-items-center rounded-2xl border border-line bg-mist text-moss">
              <Sparkles className="size-5" strokeWidth={1.7} />
            </div>
            <h3 className="mt-4 text-lg text-ink">
              Ready to search with Gemini 3.8 Flash
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted">
              Click &ldquo;Search with Gemini 3.8 Flash&rdquo; above to find websites,
              people directories, and contact brokers exposing{" "}
              <strong className="text-ink">{profile.fullName}</strong> in{" "}
              <strong className="text-ink">{profile.city}</strong>, complete with verified
              privacy officer emails.
            </p>
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={runGeminiSearch}
                className="btn btn-primary btn-sm"
              >
                <Sparkles className="size-4" />
                Search with Gemini 3.8 Flash
              </button>
            </div>
          </div>
        )
      )}

      {/* Privacy & Verification Footer Note */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-muted">
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-moss" />
          All Gemini 3.8 Flash discoveries are added to your Findings tab so you can
          send statutory GDPR, CCPA, or DPDP deletion requests via 1-click Gmail.
        </span>
      </div>
    </div>
  );
}
