"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  Phone,
  Search,
  Send,
  ShieldCheck,
} from "lucide-react";
import type {
  Finding,
  Profile,
  RequestStatus,
  SwarmAgentReport,
} from "@/lib/types";
import { cn, plural } from "@/lib/utils";
import type { ComposerSeed } from "./composer";

export function SwarmPanel({
  profile,
  findings,
  statuses,
  initialMode = "phone",
  onMergeSwarmResults,
  onCompose,
  onToast,
}: {
  profile: Profile;
  findings: Finding[];
  swarmReports?: SwarmAgentReport[];
  statuses: Record<string, RequestStatus>;
  initialMode?: "phone" | "email";
  onMergeSwarmResults: (
    newFindings: Finding[],
    reports: SwarmAgentReport[],
    mode: "phone" | "email",
    scannedValue: string
  ) => void;
  onCompose: (seeds: ComposerSeed[]) => void;
  onToast: (msg: string) => void;
}) {
  const [activeMode, setActiveMode] = useState<"phone" | "email">(initialMode);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState(profile.phones[0] || "");
  const [emailInput, setEmailInput] = useState(profile.emails[0] || "");

  useEffect(() => {
    setActiveMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!phoneInput && profile.phones[0]) setPhoneInput(profile.phones[0]);
  }, [profile.phones, phoneInput]);

  useEffect(() => {
    if (!emailInput && profile.emails[0]) setEmailInput(profile.emails[0]);
  }, [profile.emails, emailInput]);

  const phoneFindings = findings.filter(
    (f) =>
      f.matchType === "phone" ||
      (!f.matchType && f.data.includes("phone") && !f.data.includes("email"))
  );

  const emailFindings = findings.filter(
    (f) =>
      f.matchType === "email" ||
      (!f.matchType && !phoneFindings.includes(f))
  );

  const runScan = async (modeToRun: "phone" | "email") => {
    const cleanPhone = phoneInput.trim();
    const cleanEmail = emailInput.trim();

    if (modeToRun === "phone" && cleanPhone.replace(/\D/g, "").length < 7) {
      setError("Please enter a valid phone number (e.g. 9819708112).");
      return;
    }
    if (modeToRun === "email" && !/\S+@\S+\.\S+/.test(cleanEmail)) {
      setError("Please enter a valid email address (e.g. owaiskhan@adryvo.in).");
      return;
    }

    setRunning(true);
    setError(null);

    try {
      const response = await fetch("/api/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: modeToRun,
          phone: modeToRun === "phone" ? cleanPhone : undefined,
          email: modeToRun === "email" ? cleanEmail : undefined,
          fullName: profile.fullName,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        findings?: Finding[];
        reports?: SwarmAgentReport[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Scan encountered an error.");
      }

      const discovered = data.findings ?? [];
      const reports = data.reports ?? [];
      onMergeSwarmResults(
        discovered,
        reports,
        modeToRun,
        modeToRun === "phone" ? cleanPhone : cleanEmail
      );
      onToast(
        discovered.length > 0
          ? `Found ${plural(discovered.length, "webpage mention")} for ${
              modeToRun === "phone" ? cleanPhone : cleanEmail
            }.`
          : "Scan completed."
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not complete the scan."
      );
    } finally {
      setRunning(false);
    }
  };

  const activeList = activeMode === "phone" ? phoneFindings : emailFindings;
  const activeTarget = activeMode === "phone" ? phoneInput.trim() : emailInput.trim();

  return (
    <div className="space-y-6">
      {/* Bifurcated Mode Switcher: 1. Phone Number Scan vs 2. Email Scan */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-2">
        <button
          type="button"
          onClick={() => {
            setActiveMode("phone");
            setError(null);
          }}
          className={cn(
            "flex items-center justify-center gap-2.5 rounded-xl py-3.5 px-4 text-sm font-medium transition-all",
            activeMode === "phone"
              ? "bg-moss text-paper shadow-sm"
              : "text-ink-soft hover:bg-mist hover:text-ink"
          )}
        >
          <Phone className="size-4" strokeWidth={2} />
          1. Phone Number Scan ({phoneFindings.length})
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveMode("email");
            setError(null);
          }}
          className={cn(
            "flex items-center justify-center gap-2.5 rounded-xl py-3.5 px-4 text-sm font-medium transition-all",
            activeMode === "email"
              ? "bg-moss text-paper shadow-sm"
              : "text-ink-soft hover:bg-mist hover:text-ink"
          )}
        >
          <Mail className="size-4" strokeWidth={2} />
          2. Email Scan ({emailFindings.length})
        </button>
      </div>

      {/* Active Mode Scanner Bar */}
      <div className="card overflow-hidden border-moss/30">
        <div className="bg-moss-soft/50 px-6 py-6 md:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-moss-deep">
                {activeMode === "phone" ? (
                  <>
                    <Phone className="size-3.5 text-moss" />
                    Phone Number Web Mention Scanner
                  </>
                ) : (
                  <>
                    <Mail className="size-3.5 text-moss" />
                    Email Address Web Mention Scanner
                  </>
                )}
              </span>
              <h2 className="mt-1.5 text-2xl font-medium text-ink">
                {activeMode === "phone"
                  ? "Every Webpage Mentioning Your Phone Number"
                  : "Every Webpage Mentioning Your Email Address"}
              </h2>
              <p className="mt-1 text-xs text-ink-soft">
                {activeMode === "phone"
                  ? "Finds agency sites, blogs, case studies, contact footers, and directories where your exact phone number is posted—and extracts each site's email for removal."
                  : "Finds websites, blogs, directories, and B2B lists where your exact email address is published—and extracts each site's contact email for removal."}
              </p>
            </div>

            {activeTarget && (
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(activeTarget)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-xs shrink-0 flex items-center gap-1.5"
              >
                <Globe className="size-3.5 text-moss" />
                Open Raw Google Results for &ldquo;{activeTarget}&rdquo;
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              runScan(activeMode);
            }}
            className="mt-5 flex flex-col gap-3 sm:flex-row"
          >
            <div className="relative flex-1">
              {activeMode === "phone" ? (
                <>
                  <Phone
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-moss"
                    strokeWidth={1.8}
                  />
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="Enter phone number (e.g. 9819708112 or +91 9819708112)"
                    className="field bg-surface pl-10 font-mono text-sm"
                    disabled={running}
                  />
                </>
              ) : (
                <>
                  <Mail
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-moss"
                    strokeWidth={1.8}
                  />
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="Enter email address (e.g. owaiskhan@adryvo.in)"
                    className="field bg-surface pl-10 font-mono text-sm"
                    disabled={running}
                  />
                </>
              )}
            </div>

            <button
              type="submit"
              disabled={running}
              className="btn btn-primary shrink-0 flex items-center gap-2"
            >
              {running ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Scanning Google &amp; Scraping Emails...
                </>
              ) : (
                <>
                  <Search className="size-4" strokeWidth={1.8} />
                  {activeMode === "phone" ? "Scan Phone Number" : "Scan Email Address"}
                </>
              )}
            </button>
          </form>

          {error && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-clay/30 bg-clay-soft px-4 py-3 text-xs text-clay">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Results List for Active Mode */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div>
            <h3 className="text-xl font-medium text-ink">
              {activeMode === "phone"
                ? `Phone Number Mentions Found (${phoneFindings.length})`
                : `Email Address Mentions Found (${emailFindings.length})`}
            </h3>
            <p className="text-xs text-muted">
              Click <strong>Review &amp; Send Email</strong> on any website below (or{" "}
              <strong>Email All</strong>) to send a deletion notice to that website&apos;s
              contact email.
            </p>
          </div>

          {activeList.length > 0 && (
            <button
              type="button"
              onClick={() => onCompose(activeList.map((finding) => ({ finding })))}
              className="btn btn-primary btn-sm"
            >
              <Send className="size-3.5" strokeWidth={1.8} />
              Email All {activeList.length}{" "}
              {activeMode === "phone" ? "Phone Sites" : "Email Sites"}
            </button>
          )}
        </div>

        {activeList.length > 0 ? (
          <div className="grid gap-3">
            {activeList.map((finding) => {
              const status = statuses[finding.id];
              return (
                <article
                  key={finding.id}
                  className="card p-5 transition-colors hover:border-line-strong"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-moss/30 bg-moss-soft px-2.5 py-0.5 font-mono text-xs font-medium text-moss-deep">
                          {activeMode === "phone" ? (
                            <Phone className="size-3" />
                          ) : (
                            <Mail className="size-3" />
                          )}
                          {finding.matchedValue || activeTarget}
                        </span>
                        <span className="rounded-md border border-line bg-mist px-2 py-0.5 font-mono text-xs text-ink-soft">
                          {finding.domain}
                        </span>
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

                      <h4 className="mt-2 text-base font-semibold text-ink">
                        <a
                          href={finding.inspectUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-moss-deep hover:underline"
                        >
                          {finding.broker}
                        </a>
                      </h4>

                      <p className="mt-1 truncate font-mono text-[0.7rem] text-moss-deep">
                        {finding.inspectUrl}
                      </p>

                      <p className="mt-2 rounded-lg border border-line bg-mist/50 px-3 py-2 text-xs leading-relaxed text-ink-soft">
                        {finding.summary}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                          <Mail className="size-3.5 text-moss" />
                          Send Removal Email To:{" "}
                          <span className="rounded bg-moss-soft px-2 py-0.5 font-mono text-moss-deep">
                            {finding.contactEmail || `contact@${finding.domain}`}
                          </span>
                        </span>
                        {finding.note && (
                          <span className="text-[0.7rem] text-muted">
                            {finding.note}
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

                      <a
                        href={finding.inspectUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-quiet btn-xs text-muted"
                      >
                        Open Webpage
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center">
            <div className="mx-auto grid size-11 place-items-center rounded-2xl border border-line bg-mist text-moss">
              {activeMode === "phone" ? (
                <Phone className="size-5" strokeWidth={1.7} />
              ) : (
                <Mail className="size-5" strokeWidth={1.7} />
              )}
            </div>
            <h3 className="mt-4 text-lg text-ink">
              {activeMode === "phone"
                ? "Run a Phone Number Scan"
                : "Run an Email Address Scan"}
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted">
              Enter your {activeMode === "phone" ? "phone number" : "email address"} in
              the box above and click{" "}
              <strong>
                {activeMode === "phone" ? "Scan Phone Number" : "Scan Email Address"}
              </strong>{" "}
              to find every webpage where it is posted and build your removal list.
            </p>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-muted">
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-moss" />
          Phone Number Scan and Email Scan are kept completely separate so you can review
          and email websites for each identifier independently.
        </span>
      </div>
    </div>
  );
}
