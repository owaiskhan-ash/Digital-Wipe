"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  Download,
  FileSearch,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  CATEGORIES,
  DATA_LABELS,
  type Finding,
  type SwarmAgentReport,
} from "@/lib/types";
import { cn, downloadFile, formatDate, plural, toCsv } from "@/lib/utils";
import { EmptyState, SectionLabel, StatCard } from "@/components/ui";
import { Composer, type ComposerSeed } from "./composer";
import { FindingsPanel } from "./findings-panel";
import { RequestsPanel } from "./requests-panel";
import { BreachesPanel } from "./breaches-panel";
import { SwarmPanel } from "./swarm-panel";

type Tab = "findings" | "swarm" | "breaches" | "requests";

export function DashboardView() {
  const { hydrated, scan, requests, saveScan, reset, user, signIn } = useStore();
  const [tab, setTab] = useState<Tab>("swarm");
  const [seeds, setSeeds] = useState<ComposerSeed[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Tab selection via URL
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "requests") setTab("requests");
    if (params.get("tab") === "swarm") setTab("swarm");
    if (params.get("tab") === "findings") setTab("findings");
  }, [hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const stats = useMemo(() => {
    const findings = scan?.findings ?? [];
    const sent = requests.filter((request) => request.status !== "drafted").length;
    const removed = requests.filter((request) => request.status === "removed").length;
    return {
      total: findings.length,
      high: findings.filter((finding) => finding.risk === "high").length,
      sent,
      removed,
      drafted: requests.filter((request) => request.status === "drafted").length,
    };
  }, [scan, requests]);

  const statuses = useMemo(
    () =>
      Object.fromEntries(
        requests.map((request) => [request.findingId, request.status]),
      ) as Record<string, (typeof requests)[number]["status"]>,
    [requests],
  );

  const exportReport = () => {
    if (!scan) return;
    const rows: Array<Array<string | number>> = [
      [
        "Broker",
        "Domain",
        "Category",
        "Risk",
        "Data exposed",
        "Effort",
        "First seen",
        "Last seen",
        "Request status",
        "Opt-out page",
      ],
      ...scan.findings.map((finding) => {
        const request = requests.find((item) => item.findingId === finding.id);
        return [
          finding.broker,
          finding.domain,
          CATEGORIES[finding.category].label,
          finding.risk,
          finding.data.map((type) => DATA_LABELS[type]).join("; "),
          finding.effort,
          formatDate(finding.firstSeen),
          formatDate(finding.lastSeen),
          request?.status ?? "not requested",
          finding.removalUrl,
        ];
      }),
    ];
    downloadFile(
      `untrace-report-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows),
      "text/csv;charset=utf-8",
    );
    setToast("Report downloaded as CSV.");
  };

  if (!hydrated) {
    return (
      <div className="container-page py-16">
        <div className="h-8 w-48 animate-pulse-soft rounded-full bg-mist" />
        <div className="mt-5 h-4 w-72 animate-pulse-soft rounded-full bg-mist" />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse-soft rounded-2xl border border-line bg-surface" />
          ))}
        </div>
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="container-page py-16 md:py-24">
        <div className="mx-auto max-w-xl text-center">
          <SectionLabel>Your report</SectionLabel>
          <h1 className="mt-4 text-[2.4rem] leading-tight sm:text-[2.9rem]">
            Nothing scanned yet.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
            Start with your name and city. In a few seconds you&apos;ll see which
            directories hold your details, and who to write to about it.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/scan" className="btn btn-primary">
              Start a scan
              <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
            </Link>
            {!user ? (
              <button
                type="button"
                onClick={() => signIn()}
                className="btn btn-secondary"
              >
                Sign in with Google
              </button>
            ) : null}
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-2xl">
          <div className="card grid gap-5 p-6 sm:grid-cols-3">
            {[
              { title: "Listings", body: "Every directory that publishes you, ranked by sensitivity." },
              { title: "Requests", body: "A deletion email per owner, citing the right law." },
              { title: "Follow-ups", body: "A tracked clock so nothing gets ignored." },
            ].map((item) => (
              <div key={item.title}>
                <p className="text-sm font-medium text-ink">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const swarmFindingsCount = scan.findings.filter((f) =>
    Boolean(f.discoveredByAgent)
  ).length;

  const mergeSwarmResults = (
    newFindings: Finding[],
    reports: SwarmAgentReport[]
  ) => {
    const existingByDomain = new Map(
      scan.findings.map((f) => [f.domain.toLowerCase(), f])
    );

    const mergedFindings = [...scan.findings];
    let addedCount = 0;

    for (const incomingFinding of newFindings) {
      const key = incomingFinding.domain.toLowerCase();
      const existing = existingByDomain.get(key);
      if (existing) {
        const idx = mergedFindings.findIndex((f) => f.id === existing.id);
        if (idx !== -1) {
          mergedFindings[idx] = {
            ...existing,
            contactEmail: incomingFinding.contactEmail || existing.contactEmail,
            discoveredByAgent:
              incomingFinding.discoveredByAgent || existing.discoveredByAgent,
            matchType: incomingFinding.matchType || existing.matchType,
            matchedValue: incomingFinding.matchedValue || existing.matchedValue,
            note: incomingFinding.note || existing.note,
          };
        }
      } else {
        existingByDomain.set(key, incomingFinding);
        mergedFindings.unshift(incomingFinding);
        addedCount += 1;
      }
    }

    saveScan({
      ...scan,
      checked: scan.checked + addedCount,
      findings: mergedFindings,
      swarmReports: reports,
    });
  };

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: "swarm", label: "Phone & Email Lists", count: swarmFindingsCount },
    { id: "findings", label: "All Findings", count: scan.findings.length },
    { id: "breaches", label: "Breaches", count: scan.breaches.length },
    { id: "requests", label: "Requests", count: requests.length },
  ];

  return (
    <>
      <div className="container-page py-10 md:py-14">
        {/* Report header */}
        <div className="flex flex-col gap-6 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <SectionLabel>Exposure report</SectionLabel>
            <h1 className="mt-3 text-[2.2rem] leading-tight sm:text-[2.7rem]">
              Hello, {scan.profile.fullName.split(" ")[0] || "there"}.
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-xs text-muted">
              <span>{scan.profile.fullName}</span>
              <span aria-hidden>·</span>
              <span>
                {[scan.profile.city, scan.profile.region].filter(Boolean).join(", ")}
              </span>
              <span aria-hidden>·</span>
              <span>{plural(scan.checked, "source")} checked</span>
              <span aria-hidden>·</span>
              <span>{formatDate(scan.createdAt)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("swarm")}
              className="btn btn-primary btn-sm"
            >
              <Bot className="size-3.5" strokeWidth={1.8} aria-hidden />
              Phone &amp; Email Lists
            </button>
            <Link href="/scan" className="btn btn-secondary btn-sm">
              <RefreshCw className="size-3.5" strokeWidth={1.8} aria-hidden />
              New scan
            </Link>
            <button type="button" onClick={exportReport} className="btn btn-secondary btn-sm">
              <Download className="size-3.5" strokeWidth={1.8} aria-hidden />
              Export
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Delete this report and all requests from this browser?")) {
                  reset();
                  setTab("findings");
                }
              }}
              className="btn btn-quiet btn-sm text-muted"
              aria-label="Delete report"
            >
              <Trash2 className="size-3.5" strokeWidth={1.8} aria-hidden />
            </button>
          </div>
        </div>

        {/* Cloud sync status / prompt */}
        {!user ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-mist text-ink">
                <ShieldCheck className="size-4 text-moss" />
              </div>
              <div>
                <p className="text-xs font-medium text-ink">Save your report &amp; track opt-outs</p>
                <p className="text-[0.75rem] text-muted">
                  Sign in with Google in 1 click to back up your findings and follow up with data brokers across devices.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signIn()}
              className="btn btn-primary btn-sm flex items-center gap-2 text-xs"
            >
              <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              1-click Google Sign In
            </button>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-moss/20 bg-moss-soft/50 px-4 py-2.5 text-xs text-moss-deep">
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-moss" />
              <span>
                Synced to your account (<strong>{user.email}</strong>) in Firebase Firestore
              </span>
            </span>
            <span className="text-[0.6875rem] font-medium text-moss">Cloud backup active</span>
          </div>
        )}

        {/* Stats */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Listings found"
            value={stats.total}
            hint={`across ${scan.checked} sources`}
          />
          <StatCard
            label="High risk"
            value={stats.high}
            accent="clay"
            hint="Address, phone and relatives"
          />
          <StatCard
            label="Requests sent"
            value={stats.sent}
            hint={stats.drafted ? `${plural(stats.drafted, "draft")} waiting` : "None waiting"}
          />
          <StatCard
            label="Confirmed removed"
            value={stats.removed}
            accent="moss"
            hint={requests.length ? `of ${plural(requests.length, "request")}` : "Nothing yet"}
          />
        </div>

        {requests.length === 0 && scan.findings.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <ShieldCheck className="size-4 shrink-0 text-moss" strokeWidth={1.8} aria-hidden />
            <p className="text-xs leading-relaxed text-ink-soft">
              Start with the high-risk people-search listings, or deploy the AI Agent Swarm
              to search the live web for additional brokers and privacy contacts.
            </p>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setTab("swarm")}
              >
                <Bot className="size-3.5 text-moss" />
                Deploy AI Swarm
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-xs"
                onClick={() => setTab("findings")}
              >
                Show findings
              </button>
            </div>
          </div>
        ) : null}

        {/* Tabs */}
        <div className="mt-8 flex items-center gap-1 overflow-x-auto border-b border-line pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? "page" : undefined}
              className={cn(
                "relative rounded-full px-4 py-2 text-sm transition-colors",
                tab === item.id
                  ? "bg-ink text-paper"
                  : "text-ink-soft hover:bg-mist hover:text-ink",
              )}
            >
              {item.label}
              <span
                className={cn(
                  "ml-2 text-[0.6875rem] tabular-nums",
                  tab === item.id ? "text-paper/60" : "text-muted",
                )}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6 animate-fade-in">
          {tab === "findings" ? (
            scan.findings.length > 0 ? (
              <FindingsPanel
                findings={scan.findings}
                statuses={statuses}
                onCompose={(nextSeeds) => setSeeds(nextSeeds)}
              />
            ) : (
              <EmptyState
                icon={FileSearch}
                title="No public listings found"
                description="That's a good sign. Try adding a former city or an email address to widen the scan."
                action={
                  <Link href="/scan" className="btn btn-secondary btn-sm">
                    Scan again
                  </Link>
                }
              />
            )
          ) : null}

          {tab === "swarm" ? (
            <SwarmPanel
              profile={scan.profile}
              findings={scan.findings}
              swarmReports={scan.swarmReports}
              statuses={statuses}
              onMergeSwarmResults={mergeSwarmResults}
              onCompose={(nextSeeds) => setSeeds(nextSeeds)}
              onToast={setToast}
            />
          ) : null}

          {tab === "breaches" ? <BreachesPanel breaches={scan.breaches} /> : null}

          {tab === "requests" ? (
            <RequestsPanel
              requests={requests}
              findings={scan.findings}
              profile={scan.profile}
              onEdit={(seed) => setSeeds([seed])}
              onBrowse={() => setTab("findings")}
              onToast={setToast}
            />
          ) : null}
        </div>
      </div>

      {seeds ? (
        <Composer
          key={seeds.map((seed) => `${seed.finding.id}-${seed.request?.id ?? "new"}`).join("|")}
          seeds={seeds}
          profile={scan.profile}
          onClose={() => setSeeds(null)}
          onSaved={(count) => {
            setSeeds(null);
            setTab("requests");
            setToast(
              count === 1 ? "Request saved. Follow-up tracked." : `${count} requests saved.`,
            );
          }}
        />
      ) : null}

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-6">
          <div className="flex items-center gap-2 rounded-full border border-line bg-ink px-4 py-2.5 text-xs text-paper shadow-none">
            <Check className="size-3.5 text-paper/70" strokeWidth={2.4} aria-hidden />
            {toast}
          </div>
        </div>
      ) : null}
    </>
  );
}
