"use client";

import { useState } from "react";
import {
  AlertCircle,
  Bot,
  Check,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  Radar,
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
  SwarmAgentId,
  SwarmAgentReport,
} from "@/lib/types";
import { DATA_LABELS } from "@/lib/types";
import { cn, plural } from "@/lib/utils";
import { CategoryPill, RiskBadge } from "@/components/ui";
import type { ComposerSeed } from "./composer";

const DEFAULT_AGENTS: Array<{
  agentId: SwarmAgentId;
  agentName: string;
  role: string;
}> = [
  {
    agentId: "directories",
    agentName: "Directory & People-Search Recon",
    role: "Scans residential directories, whitepages, property & voter aggregators",
  },
  {
    agentId: "b2b-brokers",
    agentName: "B2B & Marketing Broker Hunter",
    role: "Tracks commercial lead databases, B2B contact brokers & email lists",
  },
  {
    agentId: "social-archives",
    agentName: "Footprint & Web Archive Crawler",
    role: "Searches usernames, cached pages, search indexes & public mentions",
  },
  {
    agentId: "dpo-resolver",
    agentName: "Privacy Desk & DPO Resolver",
    role: "Finds verified privacy officer emails & statutory opt-out endpoints",
  },
];

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
  const [expandedAgent, setExpandedAgent] = useState<SwarmAgentId | null>(null);

  const swarmFindings = findings.filter((f) => Boolean(f.discoveredByAgent));

  const runSwarm = async () => {
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
          data.error || "The AI Agent Swarm encountered an error while scanning the web."
        );
      }

      const discovered = data.findings ?? [];
      const reports = data.reports ?? [];
      onMergeSwarmResults(discovered, reports);
      onToast(
        discovered.length > 0
          ? `AI Swarm discovered ${plural(discovered.length, "removal target")} with privacy emails.`
          : "AI Swarm completed live web reconnaissance."
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not complete the AI Swarm scan. Please try again."
      );
    } finally {
      setRunning(false);
    }
  };

  const unrequestedSwarmFindings = swarmFindings.filter((f) => !statuses[f.id]);

  return (
    <div className="space-y-6">
      {/* Command Center Banner */}
      <div className="card overflow-hidden border-moss/30">
        <div className="bg-moss-soft/50 px-6 py-6 md:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-moss/25 bg-surface px-3 py-1 text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-moss-deep">
                <Radar className={cn("size-3.5 text-moss", running && "animate-spin")} />
                Open-Web Multi-Agent Reconnaissance
              </div>
              <h2 className="mt-3 text-[1.75rem] leading-tight text-ink sm:text-[2rem]">
                AI Agent Swarm for{" "}
                <span className="text-moss-deep">{profile.fullName}</span>
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft sm:text-sm">
                4 autonomous Gemini agents search across the entire internet using live
                Google Search—discovering directories, caller-ID apps, B2B lead databases,
                social archives, and official DPO emails so you can send removal notices in
                one click.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {swarmFindings.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onCompose(
                      (unrequestedSwarmFindings.length > 0
                        ? unrequestedSwarmFindings
                        : swarmFindings
                      ).map((finding) => ({ finding }))
                    )
                  }
                  className="btn btn-secondary btn-sm"
                >
                  <Mail className="size-4 text-moss" strokeWidth={1.8} />
                  Email all {swarmFindings.length} swarm targets
                </button>
              )}

              <button
                type="button"
                onClick={runSwarm}
                disabled={running}
                className="btn btn-primary flex items-center gap-2"
              >
                {running ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Swarm searching live web...
                  </>
                ) : swarmReports.length > 0 ? (
                  <>
                    <RefreshCw className="size-4" strokeWidth={1.8} />
                    Find More Across the Web
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" strokeWidth={1.8} />
                    Deploy AI Agent Swarm
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
                    runSwarm();
                  }
                }}
                placeholder="Optional focus for next sweep: e.g. employer, profession, phone directory, old city, or specific website..."
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

        {/* 4 Autonomous Agent Cards */}
        <div className="grid divide-y divide-line border-t border-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          {DEFAULT_AGENTS.map((agentSpec) => {
            const report = swarmReports.find((r) => r.agentId === agentSpec.agentId);
            const isExpanded = expandedAgent === agentSpec.agentId;

            return (
              <div
                key={agentSpec.agentId}
                className="flex flex-col justify-between bg-surface p-5 transition-colors hover:bg-mist/30"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex size-8 items-center justify-center rounded-lg border border-line bg-mist text-moss-deep">
                      <Bot className="size-4" strokeWidth={1.7} />
                    </span>

                    {running ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-moss-soft px-2.5 py-0.5 text-[0.6875rem] font-medium text-moss-deep">
                        <Loader2 className="size-3 animate-spin" />
                        Searching web
                      </span>
                    ) : report ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-moss/25 bg-moss-soft px-2.5 py-0.5 text-[0.6875rem] font-medium text-moss-deep">
                        <Check className="size-3" strokeWidth={2.4} />
                        {plural(report.findingsCount, "target")}
                      </span>
                    ) : (
                      <span className="rounded-full border border-line bg-mist px-2.5 py-0.5 text-[0.6875rem] text-muted">
                        Standby
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3.5 text-base font-medium text-ink">
                    {agentSpec.agentName}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {agentSpec.role}
                  </p>

                  {running && (
                    <div className="mt-3 space-y-1.5 rounded-lg border border-line bg-mist/60 p-2.5 text-[0.6875rem] text-ink-soft">
                      <p className="flex items-center gap-1.5 font-medium text-moss-deep">
                        <Search className="size-3" />
                        Querying Google Search index...
                      </p>
                      <p className="truncate text-muted">
                        &ldquo;{profile.fullName}&rdquo; {profile.city}
                      </p>
                    </div>
                  )}

                  {!running && report && (
                    <div className="mt-3 space-y-2 border-t border-line pt-3">
                      <p
                        className={cn(
                          "text-xs leading-relaxed text-ink-soft",
                          !isExpanded && "line-clamp-3"
                        )}
                      >
                        {report.summary}
                      </p>
                      {report.summary.length > 140 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedAgent(isExpanded ? null : agentSpec.agentId)
                          }
                          className="text-[0.6875rem] font-medium text-moss hover:underline"
                        >
                          {isExpanded ? "Show less" : "Read full briefing"}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {!running && report && report.sources.length > 0 && (
                  <div className="mt-4 border-t border-line pt-3">
                    <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted">
                      Live Web Grounding ({report.sources.length})
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {report.sources.slice(0, 3).map((src) => (
                        <li key={src.uri}>
                          <a
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 truncate text-[0.7rem] text-moss-deep hover:underline"
                          >
                            <Globe className="size-3 shrink-0 text-moss" />
                            <span className="truncate">{src.title}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Actionable Removal Email List Built by the Swarm */}
      {swarmFindings.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <div>
              <h3 className="text-xl text-ink">
                Swarm Removal Queue ({swarmFindings.length})
              </h3>
              <p className="text-xs text-muted">
                Every exposure below includes a resolved privacy contact email so you can
                review and dispatch deletion requests directly via Gmail.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                onCompose(swarmFindings.map((finding) => ({ finding })))
              }
              className="btn btn-primary btn-sm"
            >
              <Send className="size-3.5" strokeWidth={1.8} />
              Draft &amp; Send All ({swarmFindings.length})
            </button>
          </div>

          <div className="grid gap-3">
            {swarmFindings.map((finding) => {
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
                          <Bot className="size-3" />
                          {finding.discoveredByAgent}
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
              <Bot className="size-5" strokeWidth={1.7} />
            </div>
            <h3 className="mt-4 text-lg text-ink">
              Ready to dispatch the AI Reconnaissance Swarm
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted">
              Click &ldquo;Deploy AI Agent Swarm&rdquo; above. Four specialized Gemini
              agents will search the live web for{" "}
              <strong className="text-ink">{profile.fullName}</strong> in{" "}
              <strong className="text-ink">{profile.city}</strong>, extract exposed
              records, resolve each broker&apos;s privacy officer email, and build your
              removal queue.
            </p>
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={runSwarm}
                className="btn btn-primary btn-sm"
              >
                <Sparkles className="size-4" />
                Deploy AI Agent Swarm Now
              </button>
            </div>
          </div>
        )
      )}

      {/* Privacy & Verification Footer Note */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-muted">
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-moss" />
          All AI Swarm discoveries are added directly to your Findings tab so you can
          send statutory GDPR/CCPA deletion requests via 1-click Gmail.
        </span>
      </div>
    </div>
  );
}
