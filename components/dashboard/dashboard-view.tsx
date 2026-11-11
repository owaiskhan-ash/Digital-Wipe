"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Download,
  Mail,
  Phone,
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
import { SectionLabel, StatCard } from "@/components/ui";
import { Composer, type ComposerSeed } from "./composer";
import { RequestsPanel } from "./requests-panel";
import { SwarmPanel } from "./swarm-panel";

type Tab = "swarm" | "requests";

export function DashboardView() {
  const { hydrated, scan, requests, saveScan, reset, user, signIn } = useStore();
  const [tab, setTab] = useState<Tab>("swarm");
  const [scanMode, setScanMode] = useState<"phone" | "email">("phone");
  const [seeds, setSeeds] = useState<ComposerSeed[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "requests") setTab("requests");
    if (params.get("mode") === "email") {
      setScanMode("email");
      setTab("swarm");
    } else if (params.get("mode") === "phone") {
      setScanMode("phone");
      setTab("swarm");
    }
  }, [hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const stats = useMemo(() => {
    const findings = scan?.findings ?? [];
    const phoneCount = findings.filter(
      (f) => f.matchType === "phone" || (!f.matchType && f.data.includes("phone") && !f.data.includes("email"))
    ).length;
    const emailCount = findings.filter(
      (f) => f.matchType === "email" || (!f.matchType && f.matchType !== "phone" && !f.data.includes("phone"))
    ).length;
    const sent = requests.filter((request) => request.status !== "drafted").length;
    const removed = requests.filter((request) => request.status === "removed").length;
    return {
      total: findings.length,
      phoneCount,
      emailCount,
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
        "Scan Type",
        "Matched Value",
        "Page / Website Title",
        "Domain",
        "URL",
        "Contact Email",
        "Request Status",
      ],
      ...scan.findings.map((finding) => {
        const request = requests.find((item) => item.findingId === finding.id);
        return [
          finding.matchType ?? "phone",
          finding.matchedValue ?? "",
          finding.broker,
          finding.domain,
          finding.inspectUrl,
          finding.contactEmail ?? "",
          request?.status ?? "not requested",
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
          <SectionLabel>Phone &amp; Email Scanner</SectionLabel>
          <h1 className="mt-4 text-[2.4rem] leading-tight sm:text-[2.9rem]">
            Nothing scanned yet.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
            Run a <strong>Phone Number Scan</strong> or an <strong>Email Scan</strong> to
            find every webpage where your number or email is mentioned and build your
            removal list.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/scan" className="btn btn-primary">
              Start Phone or Email Scan
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
      </div>
    );
  }

  const mergeSwarmResults = (
    newFindings: Finding[],
    reports: SwarmAgentReport[],
    mode: "phone" | "email",
    scannedValue: string
  ) => {
    const otherModeFindings = scan.findings.filter(
      (f) => f.matchType && f.matchType !== mode
    );

    const updatedFindings = [...newFindings, ...otherModeFindings];
    const updatedProfile = {
      ...scan.profile,
      phones:
        mode === "phone" && scannedValue
          ? Array.from(new Set([scannedValue, ...scan.profile.phones]))
          : scan.profile.phones,
      emails:
        mode === "email" && scannedValue
          ? Array.from(new Set([scannedValue, ...scan.profile.emails]))
          : scan.profile.emails,
    };

    saveScan({
      ...scan,
      profile: updatedProfile,
      checked: scan.checked + newFindings.length,
      findings: updatedFindings,
      swarmReports: reports,
    });
  };

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: "swarm", label: "Phone & Email Scans", count: scan.findings.length },
    { id: "requests", label: "Removal Requests", count: requests.length },
  ];

  return (
    <>
      <div className="container-page py-10 md:py-14">
        {/* Report header */}
        <div className="flex flex-col gap-6 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <SectionLabel>Exposure report</SectionLabel>
            <h1 className="mt-3 text-[2.2rem] leading-tight sm:text-[2.7rem]">
              Phone &amp; Email Exposure Dashboard
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
              {scan.profile.phones.length > 0 && (
                <span className="inline-flex min-w-0 items-center gap-1 font-mono text-ink [overflow-wrap:anywhere]">
                  <Phone className="size-3.5 text-moss" />
                  {scan.profile.phones.join(", ")}
                </span>
              )}
              {scan.profile.emails.length > 0 && (
                <span className="inline-flex min-w-0 items-center gap-1 font-mono text-ink [overflow-wrap:anywhere]">
                  <Mail className="size-3.5 text-moss" />
                  {scan.profile.emails.join(", ")}
                </span>
              )}
              <span>· {formatDate(scan.createdAt)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/scan" className="btn btn-secondary btn-sm">
              <RefreshCw className="size-3.5" strokeWidth={1.8} aria-hidden />
              New Scan
            </Link>
            <button type="button" onClick={exportReport} className="btn btn-secondary btn-sm">
              <Download className="size-3.5" strokeWidth={1.8} aria-hidden />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Delete this report and all requests from this browser?")) {
                  reset();
                  setTab("swarm");
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
                <p className="text-xs font-medium text-ink">Save your Phone &amp; Email scan lists</p>
                <p className="text-[0.75rem] text-muted">
                  Sign in with Google in 1 click to back up your findings and removal emails across devices.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signIn()}
              className="btn btn-primary btn-sm flex items-center gap-2 text-xs"
            >
              1-click Google Sign In
            </button>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-moss/20 bg-moss-soft/50 px-4 py-2.5 text-xs text-moss-deep">
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-moss" />
              <span>
                Synced to your account (<strong>{user.email}</strong>)
              </span>
            </span>
            <span className="text-[0.6875rem] font-medium text-moss">Cloud backup active</span>
          </div>
        )}

        {/* Stats */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Phone Number Mentions"
            value={stats.phoneCount}
            hint="Webpages mentioning your number"
          />
          <StatCard
            label="Email Address Mentions"
            value={stats.emailCount}
            hint="Webpages mentioning your email"
          />
          <StatCard
            label="Removal Emails Sent"
            value={stats.sent}
            hint={stats.drafted ? `${plural(stats.drafted, "draft")} waiting` : "Ready to send"}
          />
          <StatCard
            label="Confirmed Removed"
            value={stats.removed}
            accent="moss"
            hint={requests.length ? `of ${plural(requests.length, "request")}` : "Nothing yet"}
          />
        </div>

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
          {tab === "swarm" ? (
            <SwarmPanel
              profile={scan.profile}
              findings={scan.findings}
              swarmReports={scan.swarmReports}
              statuses={statuses}
              initialMode={scanMode}
              onMergeSwarmResults={mergeSwarmResults}
              onCompose={(nextSeeds) => setSeeds(nextSeeds)}
              onToast={setToast}
            />
          ) : null}

          {tab === "requests" ? (
            <RequestsPanel
              requests={requests}
              findings={scan.findings}
              profile={scan.profile}
              onEdit={(seed) => setSeeds([seed])}
              onBrowse={() => setTab("swarm")}
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
