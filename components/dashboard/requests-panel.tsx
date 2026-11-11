"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Inbox,
  Mail,
  MailOpen,
  Trash2,
} from "lucide-react";
import type { Finding, Profile, RemovalRequest, RequestStatus } from "@/lib/types";
import { REQUEST_STATUS_META } from "@/lib/types";
import { buildFollowUpEmail, mailtoLink } from "@/lib/removal";
import { useStore } from "@/lib/store";
import { cn, copyText, formatDate, plural } from "@/lib/utils";
import { CategoryPill, EmptyState } from "@/components/ui";
import type { ComposerSeed } from "./composer";

const STATUS_ORDER: RequestStatus[] = ["drafted", "sent", "confirmed", "removed", "refused"];

const STATUS_DOT: Record<RequestStatus, string> = {
  drafted: "bg-line-strong",
  sent: "bg-moss",
  confirmed: "bg-lilac",
  removed: "bg-moss",
  refused: "bg-clay",
};

export function RequestsPanel({
  requests,
  findings,
  profile,
  onEdit,
  onBrowse,
  onToast,
}: {
  requests: RemovalRequest[];
  findings: Finding[];
  profile: Profile;
  onEdit: (seed: ComposerSeed) => void;
  onBrowse: () => void;
  onToast: (message: string) => void;
}) {
  const { setRequestStatus, removeRequest } = useStore();
  const [filter, setFilter] = useState<RequestStatus | "all">("all");
  const [followUpFor, setFollowUpFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const byId = useMemo(
    () => new Map(findings.map((finding) => [finding.id, finding])),
    [findings],
  );

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: requests.length };
    for (const status of STATUS_ORDER) {
      base[status] = requests.filter((request) => request.status === status).length;
    }
    return base;
  }, [requests]);

  const visible = requests.filter((request) => filter === "all" || request.status === filter);
  const removed = counts.removed ?? 0;
  const total = requests.length;
  const progress = total ? Math.round((removed / total) * 100) : 0;

  const fallbackFinding = (request: RemovalRequest): Finding => ({
    id: request.findingId,
    brokerId: request.findingId,
    broker: request.brokerName,
    domain: request.domain,
    category: request.category,
    data: ["fullName"],
    risk: "medium",
    effort: "medium",
    fix: "email",
    removalUrl: request.removalUrl,
    contactEmail: request.contactEmail,
    inspectUrl: `https://${request.domain}`,
    firstSeen: request.createdAt,
    lastSeen: request.createdAt,
    summary: "A request you saved earlier.",
  });

  const copyRequest = async (request: RemovalRequest) => {
    const ok = await copyText(`Subject: ${request.subject}\n\n${request.body}`);
    if (ok) {
      setCopied(request.id);
      window.setTimeout(() => setCopied(null), 1800);
    }
  };

  const copyFollowUp = async (request: RemovalRequest) => {
    const followUp = buildFollowUpEmail({ profile, request });
    const ok = await copyText(`Subject: ${followUp.subject}\n\n${followUp.body}`);
    if (ok) {
      setCopied(`follow-${request.id}`);
      onToast("Follow-up copied. Paste it into the same email thread.");
      window.setTimeout(() => setCopied(null), 1800);
    }
  };

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No requests yet"
        description="Choose a listing in Findings and draft a deletion request. Everything you send is tracked here, with a follow-up date."
        action={
          <button type="button" onClick={onBrowse} className="btn btn-secondary btn-sm">
            Browse findings
            <ArrowRight className="size-3.5" strokeWidth={1.8} aria-hidden />
          </button>
        }
      />
    );
  }

  return (
    <div>
      <div className="card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
              Removal progress
            </p>
            <p className="mt-1.5 text-sm text-ink">
              {removed} of {plural(total, "listing")} confirmed removed
            </p>
          </div>
          <p className="font-display text-2xl text-moss">{progress}%</p>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-mist">
          <div
            className="h-full rounded-full bg-moss transition-[width] duration-500"
            style={{ width: `${Math.max(progress, total ? 2 : 0)}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Companies have 30 to 45 days to reply. Untrace keeps the clock for each one.
        </p>
      </div>

      <div className="mt-5 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn("chip", filter === "all" && "chip-active")}
        >
          All <span className="tabular-nums opacity-60">{counts.all}</span>
        </button>
        {STATUS_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={cn("chip", filter === status && "chip-active")}
          >
            {REQUEST_STATUS_META[status].label}
            <span className="tabular-nums opacity-60">{counts[status]}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {visible.map((request) => {
          const overdue =
            request.status === "sent" &&
            request.followUpAt !== undefined &&
            new Date(request.followUpAt).getTime() < Date.now();
          const finding = byId.get(request.findingId) ?? fallbackFinding(request);

          return (
            <article key={request.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[1rem] font-medium text-ink">{request.brokerName}</h3>
                    <span className="text-xs text-muted">{request.domain}</span>
                    <CategoryPill category={request.category} withIcon={false} />
                  </div>
                  <p className="mt-1.5 line-clamp-1 max-w-xl text-xs text-muted">
                    {request.subject}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={cn("size-1.5 rounded-full", STATUS_DOT[request.status])}
                    aria-hidden
                  />
                  <label className="sr-only" htmlFor={`status-${request.id}`}>
                    Request status
                  </label>
                  <select
                    id={`status-${request.id}`}
                    value={request.status}
                    onChange={(event) =>
                      setRequestStatus(request.id, event.target.value as RequestStatus)
                    }
                    className="rounded-full border border-line bg-surface py-1.5 pl-3 pr-8 text-xs text-ink-soft focus:border-moss focus:outline-none"
                  >
                    {STATUS_ORDER.map((status) => (
                      <option key={status} value={status}>
                        {REQUEST_STATUS_META[status].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.6875rem] text-muted">
                <span>
                  {request.contactEmail ? `To ${request.contactEmail}` : "Sent via opt-out form"}
                </span>
                <span>Drafted {formatDate(request.createdAt)}</span>
                {request.followUpAt ? (
                  <span className={cn(overdue && "text-amber")}>
                    {overdue ? "Follow-up due" : "Follow-up"} {formatDate(request.followUpAt)}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
                {request.contactEmail && (
                  <button
                    type="button"
                    onClick={() => onEdit({ finding, request })}
                    className="btn btn-primary btn-xs flex items-center gap-1.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white"
                    title="Review and send via Gmail"
                  >
                    <Mail className="size-3" strokeWidth={1.8} aria-hidden />
                    Send via Gmail
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onEdit({ finding, request })}
                  className="btn btn-quiet btn-xs"
                >
                  <MailOpen className="size-3.5" strokeWidth={1.8} aria-hidden />
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => copyRequest(request)}
                  className="btn btn-quiet btn-xs"
                >
                  {copied === request.id ? (
                    <Check className="size-3.5 text-moss" strokeWidth={2.2} aria-hidden />
                  ) : (
                    <Copy className="size-3.5" strokeWidth={1.8} aria-hidden />
                  )}
                  {copied === request.id ? "Copied" : "Copy"}
                </button>
                {request.contactEmail ? (
                  <a
                    href={mailtoLink(request.contactEmail, request.subject, request.body)}
                    className="btn btn-quiet btn-xs"
                  >
                    <Mail className="size-3.5" strokeWidth={1.8} aria-hidden />
                    Email again
                  </a>
                ) : null}
                <a
                  href={request.removalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-quiet btn-xs"
                >
                  <ExternalLink className="size-3.5" strokeWidth={1.8} aria-hidden />
                  Opt-out page
                </a>
                <button
                  type="button"
                  onClick={() =>
                    setFollowUpFor((current) => (current === request.id ? null : request.id))
                  }
                  className="btn btn-quiet btn-xs"
                >
                  Follow-up
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete your ${request.brokerName} request from this browser?`)) {
                      removeRequest(request.id);
                      onToast("Request deleted.");
                    }
                  }}
                  className="btn btn-quiet btn-xs text-muted sm:ml-auto"
                  aria-label={`Delete request for ${request.brokerName}`}
                >
                  <Trash2 className="size-3.5" strokeWidth={1.8} aria-hidden />
                </button>
              </div>

              {followUpFor === request.id ? (
                <div className="mt-3 animate-fade-in rounded-xl border border-amber/25 bg-amber-soft px-4 py-3">
                  <p className="text-xs font-medium text-amber">
                    It&apos;s been a while. Here&apos;s the nudge.
                  </p>
                  <p className="mt-1 text-[0.6875rem] leading-relaxed text-amber/90">
                    The follow-up restates your original request and gives them ten
                    business days before you escalate to a regulator.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => copyFollowUp(request)}
                      className="btn btn-secondary btn-xs"
                    >
                      {copied === `follow-${request.id}` ? (
                        <Check className="size-3.5 text-moss" strokeWidth={2.2} aria-hidden />
                      ) : (
                        <Copy className="size-3.5" strokeWidth={1.8} aria-hidden />
                      )}
                      Copy follow-up
                    </button>
                    {request.contactEmail ? (
                      <a
                        href={mailtoLink(
                          request.contactEmail,
                          buildFollowUpEmail({ profile, request }).subject,
                          buildFollowUpEmail({ profile, request }).body,
                        )}
                        className="btn btn-secondary btn-xs"
                      >
                        <Mail className="size-3.5" strokeWidth={1.8} aria-hidden />
                        Open in mail app
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}

        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
            <p className="text-sm text-ink">Nothing in this stage yet.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
