"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Info,
  Loader2,
  Mail,
  Save,
  Send,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  TEMPLATES,
  buildRemovalEmail,
  mailtoLink,
  type TemplateId,
} from "@/lib/removal";
import { useStore } from "@/lib/store";
import {
  CATEGORIES,
  type DataType,
  type Finding,
  type Profile,
  type RemovalRequest,
} from "@/lib/types";
import { DATA_LABELS } from "@/lib/types";
import { addDays, cn, copyText, formatDate } from "@/lib/utils";
import { CategoryPill, RiskBadge } from "@/components/ui";
import { describeSendError, sendEmailViaGmail } from "@/lib/gmail";

export type ComposerSeed = {
  finding: Finding;
  request?: RemovalRequest;
  subject?: string;
  body?: string;
};

type Entry = {
  finding: Finding;
  template: TemplateId;
  contact: string;
  subject: string;
  body: string;
  original?: RemovalRequest;
};

function defaultTemplate(profile: Profile): TemplateId {
  const country = profile.country.toLowerCase();
  return country.includes("united kingdom") ||
    country.includes("europe") ||
    country.includes("germany") ||
    country.includes("france") ||
    country.includes("ireland") ||
    country.includes("netherlands") ||
    country.includes("spain")
    ? "gdpr"
    : "standard";
}

export function Composer({
  seeds,
  profile,
  onClose,
  onSaved,
}: {
  seeds: ComposerSeed[];
  profile: Profile;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const { upsertRequest, user, signIn } = useStore();
  const [index, setIndex] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [copied, setCopied] = useState<"email" | "none">("none");
  const [notice, setNotice] = useState("");

  // Gmail sending confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSendingGmail, setIsSendingGmail] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);

  const [entries, setEntries] = useState<Entry[]>(() =>
    seeds.map((seed) => {
      if (seed.request) {
        return {
          finding: seed.finding,
          template: (seed.request.body.includes("Article 17") ? "gdpr" : "standard") as TemplateId,
          contact: seed.request.contactEmail,
          subject: seed.subject ?? seed.request.subject,
          body: seed.body ?? seed.request.body,
          original: seed.request,
        };
      }
      const template = defaultTemplate(profile);
      const email = buildRemovalEmail({ profile, finding: seed.finding, template });
      return {
        finding: seed.finding,
        template,
        contact: seed.finding.contactEmail ?? "",
        subject: seed.subject ?? email.subject,
        body: seed.body ?? email.body,
      };
    })
  );

  const entry = entries[index];
  const total = entries.length;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !showConfirmModal) onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, showConfirmModal]);

  useEffect(() => {
    if (copied === "none") return;
    const timer = window.setTimeout(() => setCopied("none"), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const update = (patch: Partial<Entry>) =>
    setEntries((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    );

  const changeTemplate = (template: TemplateId) => {
    const email = buildRemovalEmail({ profile, finding: entry.finding, template });
    update({ template, subject: email.subject, body: email.body });
  };

  const copy = async () => {
    const ok = await copyText(`Subject: ${entry.subject}\n\n${entry.body}`);
    setCopied(ok ? "email" : "none");
    if (!ok) setNotice("Your browser blocked the clipboard. Select the text instead.");
  };

  const openMail = () => {
    if (!entry.contact.trim()) {
      setNotice("Add the company's privacy email first, or use their opt-out form.");
      return;
    }
    window.location.href = mailtoLink(entry.contact.trim(), entry.subject, entry.body);
  };

  const persist = (status: "drafted" | "sent") => {
    const now = new Date().toISOString();
    const original = entry.original;
    const request: RemovalRequest = {
      id: original?.id ?? `req_${Date.now().toString(36)}_${index}`,
      findingId: entry.finding.id,
      brokerName: entry.finding.broker,
      domain: entry.finding.domain,
      category: entry.finding.category,
      contactEmail: entry.contact.trim(),
      subject: entry.subject,
      body: entry.body,
      status,
      createdAt: original?.createdAt ?? now,
      sentAt: status === "sent" ? original?.sentAt ?? now : original?.sentAt,
      followUpAt:
        status === "sent" ? original?.followUpAt ?? addDays(now, 30) : original?.followUpAt,
      removalUrl: entry.finding.removalUrl,
    };

    upsertRequest(request);
    const next = savedCount + 1;
    setSavedCount(next);

    if (status === "sent" && index < total - 1) {
      setIndex(index + 1);
      setNotice("");
      return;
    }

    if (status === "drafted" && index < total - 1) {
      setIndex(index + 1);
      return;
    }

    onSaved(next);
  };

  // Gmail sending workflow
  const handleInitiateGmailSend = async () => {
    setNotice("");
    setGmailError(null);

    if (!entry.contact.trim()) {
      setNotice("Please add the destination privacy email address first.");
      return;
    }

    if (!user) {
      try {
        await signIn();
      } catch (err: unknown) {
        setNotice(err instanceof Error ? err.message : "Sign-in required to use Gmail");
        return;
      }
    }

    setShowConfirmModal(true);
  };

  const handleConfirmGmailSend = async () => {
    if (!user || !user.email) {
      setGmailError("Please sign in with your Google account first.");
      return;
    }

    setIsSendingGmail(true);
    setGmailError(null);

    try {
      const { ensureGmailToken } = await import("@/lib/firebase");
      const accessToken = await ensureGmailToken();
      await sendEmailViaGmail({
        to: entry.contact.trim(),
        from: user.email,
        subject: entry.subject,
        body: entry.body,
        accessToken,
      });

      setShowConfirmModal(false);
      persist("sent");
    } catch (err: unknown) {
      console.error("Gmail send error:", err);
      const message = err instanceof Error ? err.message : String(err ?? "");

      // A stale or scope-less token cannot recover on its own: drop it so the
      // next press of Send asks Google again instead of replaying the failure.
      if (/401|Invalid Credentials|insufficient|expired/i.test(message)) {
        const fb = await import("@/lib/firebase");
        fb.clearGmailToken();
      }

      setGmailError(describeSendError(err));
    } finally {
      setIsSendingGmail(false);
    }
  };

  const next = () => {
    setNotice("");
    setIndex((current) => Math.min(total - 1, current + 1));
  };
  const previous = () => {
    setNotice("");
    setIndex((current) => Math.max(0, current - 1));
  };

  const dataTypes = useMemo(
    () => entry.finding.data.filter((type) => type !== "fullName") as DataType[],
    [entry.finding]
  );

  const isGdpr = entry.template === "gdpr";
  const deadline = isGdpr
    ? "one month"
    : profile.country.toLowerCase().includes("united states")
    ? "45 days"
    : "30 days";

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end">
        <button
          type="button"
          aria-label="Close composer"
          className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
          onClick={onClose}
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Removal request for ${entry.finding.broker}`}
          className="relative flex h-full w-full max-w-[46rem] animate-slide-in flex-col border-l border-line bg-paper"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 md:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-moss-soft text-moss">
                <Mail className="size-4" strokeWidth={1.7} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
                  Removal request
                </p>
                <p className="truncate text-sm font-medium text-ink">
                  {entry.finding.broker}
                  <span className="ml-2 font-normal text-muted">{entry.finding.domain}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {total > 1 ? (
                <div className="flex items-center gap-1 rounded-full border border-line bg-surface py-1 pl-1 pr-2">
                  <button
                    type="button"
                    onClick={previous}
                    disabled={index === 0}
                    className="grid size-7 place-items-center rounded-full text-ink-soft transition-colors hover:bg-mist disabled:opacity-30"
                    aria-label="Previous request"
                  >
                    <ChevronLeft className="size-4" strokeWidth={1.8} aria-hidden />
                  </button>
                  <span className="text-xs tabular-nums text-muted">
                    {index + 1} / {total}
                  </span>
                  <button
                    type="button"
                    onClick={next}
                    disabled={index === total - 1}
                    className="grid size-7 place-items-center rounded-full text-ink-soft transition-colors hover:bg-mist disabled:opacity-30"
                    aria-label="Next request"
                  >
                    <ChevronRight className="size-4" strokeWidth={1.8} aria-hidden />
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
                aria-label="Close"
              >
                <X className="size-4" strokeWidth={1.8} aria-hidden />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-6 md:px-7">
            <div className="rounded-xl border border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <CategoryPill category={entry.finding.category} />
                <RiskBadge risk={entry.finding.risk} />
                <span className="text-[0.6875rem] text-muted">
                  Last seen {formatDate(entry.finding.lastSeen)}
                </span>
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">{entry.finding.summary}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {dataTypes.slice(0, 6).map((type) => (
                  <span
                    key={type}
                    className="rounded-md border border-line bg-mist px-1.5 py-0.5 text-[0.6875rem] text-ink-soft"
                  >
                    {DATA_LABELS[type]}
                  </span>
                ))}
              </div>
              {entry.finding.note ? (
                <p className="mt-3 flex items-start gap-1.5 border-t border-line pt-2.5 text-[0.6875rem] leading-relaxed text-muted">
                  <Info className="mt-0.5 size-3 shrink-0" strokeWidth={1.8} aria-hidden />
                  {entry.finding.note}
                </p>
              ) : null}
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="label" htmlFor="contact">
                  Send to
                </label>
                <div className="flex min-w-0 flex-wrap gap-2">
                  <input
                    id="contact"
                    className="field min-w-0 flex-1"
                    value={entry.contact}
                    onChange={(event) => update({ contact: event.target.value })}
                    placeholder="privacy@company.com"
                    inputMode="email"
                    type="email"
                  />
                  <a
                    href={entry.finding.removalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    Opt-out page
                    <ExternalLink className="size-3.5" strokeWidth={1.8} aria-hidden />
                  </a>
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {entry.finding.contactEmail
                    ? "Official privacy contact. Modify if another address is listed on their suppression page."
                    : "No email is published for this site. Use their opt-out form or enter an address from their privacy notice."}
                </p>
              </div>

              <div>
                <p className="label">Tone and legal basis</p>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => changeTemplate(template.id)}
                      className={cn("chip", entry.template === template.id && "chip-active")}
                      title={template.blurb}
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {TEMPLATES.find((template) => template.id === entry.template)?.blurb}
                </p>
              </div>

              <div>
                <label className="label" htmlFor="subject">
                  Subject
                </label>
                <input
                  id="subject"
                  className="field"
                  value={entry.subject}
                  onChange={(event) => update({ subject: event.target.value })}
                />
              </div>

              <div>
                <div className="flex items-end justify-between">
                  <label className="label" htmlFor="body">
                    Message
                  </label>
                  <span className="mb-1.5 text-[0.6875rem] text-muted">
                    {entry.body.length.toLocaleString("en-GB")} characters
                  </span>
                </div>
                <textarea
                  id="body"
                  className="field min-h-[22rem] resize-y py-3.5 text-[0.8125rem] leading-[1.7]"
                  value={entry.body}
                  onChange={(event) => update({ body: event.target.value })}
                  spellCheck
                />
                <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-muted">
                  <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.7} aria-hidden />
                  Cites {CATEGORIES[entry.finding.category].label.toLowerCase()} exposure and gives
                  them {deadline} to answer. You can edit any details.
                </p>
              </div>

              {notice ? (
                <p className="rounded-xl border border-amber/25 bg-amber-soft px-4 py-2.5 text-xs text-amber">
                  {notice}
                </p>
              ) : null}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-line bg-paper px-5 py-4 md:px-7">
            <div className="flex flex-wrap items-center gap-2">
              {/* Primary: Send with Gmail API */}
              <button
                type="button"
                onClick={handleInitiateGmailSend}
                className="btn btn-primary btn-sm flex items-center gap-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white"
                title="Send directly from your Google account via Gmail API"
              >
                <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                </svg>
                <span>Send with Gmail</span>
              </button>

              {entry.contact.trim() ? (
                <a
                  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                    entry.contact.trim()
                  )}&su=${encodeURIComponent(entry.subject)}&body=${encodeURIComponent(
                    entry.body
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => persist("sent")}
                  className="btn btn-secondary btn-sm"
                  title="Open pre-filled message in Gmail Web (no OAuth verification required)"
                >
                  <ExternalLink className="size-3.5" strokeWidth={1.8} aria-hidden />
                  Gmail Web
                </a>
              ) : null}

              <button type="button" onClick={openMail} className="btn btn-secondary btn-sm">
                <Mail className="size-3.5" strokeWidth={1.8} aria-hidden />
                Mail app
              </button>

              <button type="button" onClick={copy} className="btn btn-secondary btn-sm">
                {copied === "email" ? (
                  <Check className="size-3.5 text-moss" strokeWidth={2.2} aria-hidden />
                ) : (
                  <Copy className="size-3.5" strokeWidth={1.8} aria-hidden />
                )}
                {copied === "email" ? "Copied" : "Copy"}
              </button>

              <button
                type="button"
                onClick={() => persist("drafted")}
                className="btn btn-quiet btn-sm"
              >
                <Save className="size-3.5" strokeWidth={1.8} aria-hidden />
                Save draft
              </button>

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => persist("sent")}
                  className="btn btn-quiet btn-sm text-xs"
                  title="Mark as sent manually if you sent outside this browser"
                >
                  Mark sent
                </button>
              </div>
            </div>

            <p className="mt-2.5 text-[0.6875rem] text-muted">
              Sending via Gmail sends directly from your connected address and starts the{" "}
              {deadline} response countdown.
            </p>
          </div>
        </div>
      </div>

      {/* Mandatory User Confirmation Dialog for Workspace API email dispatch */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => !isSendingGmail && setShowConfirmModal(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            aria-describedby="confirm-modal-description"
            className="relative w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl animate-fade-in"
          >
            <div className="flex items-start gap-3.5">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-soft text-amber">
                <ShieldAlert className="size-5" />
              </div>
              <div className="flex-1">
                <h3 id="confirm-modal-title" className="text-lg font-medium text-ink">
                  Send deletion email via Gmail?
                </h3>
                <p id="confirm-modal-description" className="mt-1 text-xs text-muted">
                  This will dispatch an official personal data erasure request from your connected
                  account directly to the privacy desk of{" "}
                  <strong className="text-ink">{entry.finding.broker}</strong>.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-mist/50 p-3.5 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-muted">From:</span>
                <span className="font-medium text-ink truncate max-w-[280px]">
                  {user?.email || "Connected Google Account"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">To:</span>
                <span className="font-medium text-ink">{entry.contact}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Subject:</span>
                <span className="font-medium text-ink truncate max-w-[280px]">{entry.subject}</span>
              </div>
            </div>

            {gmailError && (
              <div className="mt-3 rounded-lg border border-clay/30 bg-clay-soft px-3.5 py-2.5 text-xs text-clay space-y-1.5">
                <p>{gmailError}</p>
                <p className="text-ink-soft">
                  Seeing <strong className="font-medium text-ink">Error 403: access_denied</strong>?
                  Add your email to{" "}
                  <a
                    href="https://console.cloud.google.com/auth/audience?project=gen-lang-client-0472789139"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium text-ink"
                  >
                    Google Cloud OAuth Test Users / Publish App
                  </a>{" "}
                  or click <strong className="font-medium text-ink">Gmail Web</strong> to send
                  immediately without OAuth.
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isSendingGmail}
                onClick={() => setShowConfirmModal(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              {entry.contact.trim() ? (
                <a
                  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                    entry.contact.trim()
                  )}&su=${encodeURIComponent(entry.subject)}&body=${encodeURIComponent(
                    entry.body
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    setShowConfirmModal(false);
                    persist("sent");
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  Open in Gmail Web
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
              <button
                type="button"
                disabled={isSendingGmail}
                onClick={handleConfirmGmailSend}
                className="btn btn-primary btn-sm flex items-center gap-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white"
              >
                {isSendingGmail ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sending email...
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    Confirm &amp; Send Email
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
