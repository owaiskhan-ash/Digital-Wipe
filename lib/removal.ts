import type { Finding, Profile, RemovalRequest } from "./types";
import { DATA_LABELS } from "./types";
import { formatDate, todayLong } from "./utils";

export type TemplateId = "standard" | "gdpr" | "short" | "followup";

export const TEMPLATES: Array<{ id: TemplateId; label: string; blurb: string }> = [
  {
    id: "standard",
    label: "Standard request",
    blurb: "US state privacy laws. Firm, specific, 45-day deadline.",
  },
  {
    id: "gdpr",
    label: "GDPR request",
    blurb: "Article 17 erasure with the EU/UK wording and a one-month deadline.",
  },
  {
    id: "short",
    label: "Short note",
    blurb: "For opt-out forms with a small message box.",
  },
];

type Jurisdiction = {
  name: string;
  law: string;
  deadline: string;
  regulator: string;
};

function jurisdictionFor(country: string): Jurisdiction {
  const value = country.toLowerCase();
  if (value.includes("united states") || value === "us" || value === "usa") {
    return {
      name: "United States",
      law: "the California Consumer Privacy Act as amended by the CPRA (Cal. Civ. Code §1798.100 et seq.) and the comparable privacy law of my state of residence",
      deadline: "45 days",
      regulator: "the California Privacy Protection Agency or my state attorney general",
    };
  }
  if (value.includes("united kingdom") || value === "uk" || value.includes("britain")) {
    return {
      name: "United Kingdom",
      law: "Article 17 of the UK GDPR and the Data Protection Act 2018",
      deadline: "one month",
      regulator: "the Information Commissioner's Office (ico.org.uk)",
    };
  }
  if (value.includes("europe") || value.includes("germany") || value.includes("france") || value.includes("ireland") || value.includes("netherlands") || value.includes("spain") || value.includes("italy") || value.includes("sweden") || value.includes("poland") || value.includes("portugal")) {
    return {
      name: "European Union",
      law: "Article 17 of the General Data Protection Regulation (EU) 2016/679",
      deadline: "one month",
      regulator: "my national supervisory authority",
    };
  }
  if (value.includes("india")) {
    return {
      name: "India",
      law: "the Digital Personal Data Protection Act, 2023 (sections 12 and 13, right to erasure)",
      deadline: "30 days",
      regulator: "the Data Protection Board of India",
    };
  }
  if (value.includes("canada")) {
    return {
      name: "Canada",
      law: "the Personal Information Protection and Electronic Documents Act (PIPEDA), Principle 4.9 and section 8(8)",
      deadline: "30 days",
      regulator: "the Office of the Privacy Commissioner of Canada",
    };
  }
  if (value.includes("australia")) {
    return {
      name: "Australia",
      law: "the Privacy Act 1988 (Cth) and Australian Privacy Principles 11 and 13",
      deadline: "30 days",
      regulator: "the Office of the Australian Information Commissioner",
    };
  }
  return {
    name: country || "my country",
    law: "the applicable data protection and privacy law of my country",
    deadline: "30 days",
    regulator: "the relevant data protection authority",
  };
}

function identityLines(profile: Profile, finding?: Finding): string[] {
  const lines: string[] = [];
  if (finding?.matchedValue) {
    const label =
      finding.matchType === "phone"
        ? "Primary Phone Number to Remove"
        : finding.matchType === "email"
          ? "Primary Email Address to Remove"
          : "Primary Identifier";
    lines.push(`${label}: ${finding.matchedValue}`);
  }
  if (profile.phones.length) lines.push(`Phone number(s): ${profile.phones.join(", ")}`);
  if (profile.emails.length) lines.push(`Email address(es): ${profile.emails.join(", ")}`);
  if (profile.fullName) lines.push(`Full name: ${profile.fullName}`);
  if (profile.city || profile.region) {
    lines.push(
      `Location: ${[profile.city, profile.region, profile.country].filter(Boolean).join(", ")}`,
    );
  }
  if (profile.usernames.length)
    lines.push(`Usernames: ${profile.usernames.map((u) => `@${u}`).join(", ")}`);
  lines.push(`Request date: ${todayLong()}`);
  return lines;
}

function dataLines(finding: Finding): string[] {
  return finding.data
    .filter((type) => type !== "fullName")
    .map((type) => `• ${DATA_LABELS[type]}`);
}

function signature(profile: Profile): string {
  const contact = profile.emails[0] ?? "";
  const place = [profile.city, profile.region, profile.country].filter(Boolean).join(", ");
  return [profile.fullName, contact, place, todayLong()]
    .filter(Boolean)
    .join("\n");
}

export function buildRemovalEmail(params: {
  profile: Profile;
  finding: Finding;
  template?: TemplateId;
}): { subject: string; body: string } {
  const { profile, finding } = params;
  const template = params.template ?? "standard";
  const legal = jurisdictionFor(profile.country);
  const data = finding.category === "breach" ? [] : dataLines(finding);

  if (template === "short") {
    return {
      subject: `Please remove my personal information from ${finding.broker}`,
      body: `Hello ${finding.broker} privacy team,

I am writing to ask you to delete the personal information you hold about me and to stop publishing or selling it.

${identityLines(profile, finding).join("\n")}

You currently appear to show my ${finding.data
        .filter((type) => type !== "fullName")
        .slice(0, 4)
        .map((type) => DATA_LABELS[type].toLowerCase())
        .join(", ")}. Please remove that listing and confirm when it is done.

I am making this request under ${legal.law}, and would be grateful for a reply within ${legal.deadline}.

Thank you,
${signature(profile)}`,
    };
  }

  const gdpr = template === "gdpr";
  const subjectIdentifier =
    finding.matchedValue || profile.phones[0] || profile.emails[0] || profile.fullName;
  const subject = gdpr
    ? `Erasure request under Article 17 GDPR (${subjectIdentifier})`
    : `Request to delete and opt out of the sale of my personal information (${subjectIdentifier})`;

  const intro = gdpr
    ? `I am the data subject identified below. I am writing to exercise my right to erasure under Article 17(1) of the GDPR, and my right to object to processing under Article 21.`
    : `I am the data subject identified below. I am writing to request the deletion of my personal information, and to opt out of the sale and sharing of that information.`;

  const asks = gdpr
    ? [
        "Erase all personal data you hold associated with my phone number(s), email address(es), and identity, including inferred, derived and pseudonymised profiles (Article 17(1)(a) to (f)).",
        "Stop all processing for direct marketing and advertising, and record this objection permanently (Article 21(2) to (3)).",
        "Instruct every third party and processor to whom you have disclosed my data to erase it (Article 17(2)), and tell me who those recipients are (Article 15).",
        "Remove or de-index any public profile or phone/email listing so it no longer appears in search engines.",
        "Confirm the erasure in writing, or explain any refusal and its legal basis, within one month.",
      ]
    : [
        "Delete all personal information you hold associated with my phone number(s), email address(es), and identity, including records you have inferred, derived or licensed from other sources.",
        "Opt me out of the sale and sharing of my phone number, email address, and personal information across your brands and affiliates.",
        "Suppress my phone number, email address, and listing from your public search results and ask search engines to drop the page.",
        "Tell me which categories of my information you sold or shared in the past 12 months, and to whom.",
        `Confirm in writing what has been deleted, or explain any refusal and its legal basis, within ${legal.deadline}.`,
      ];

  const body = `To the Privacy Team at ${finding.broker},

${intro}

Personal information you appear to hold about me
${data.length ? data.join("\n") : "• The personal information listed in your records under my phone number / email address"}

Identity details (Pinpoint Identifiers)
${identityLines(profile, finding).join("\n")}

What I am asking for
${asks.map((ask, index) => `${index + 1}. ${ask}`).join("\n")}

Legal basis
This request is made under ${legal.law}. It is submitted on my own behalf as the data subject. Please treat it as a verified request: it comes from the email address listed above, and I can provide further identification if you genuinely need it.

I do not consent to my information being retained for marketing, analytics or "legitimate interests" purposes. If you rely on a legal exception, say which one and why it outweighs my rights.

If I do not receive a substantive reply within ${legal.deadline}, I will escalate the matter to ${legal.regulator}.

Sincerely,
${signature(profile)}`;

  return { subject, body };
}

export function buildFollowUpEmail(params: {
  profile: Profile;
  request: RemovalRequest;
}): { subject: string; body: string } {
  const { profile, request } = params;
  const legal = jurisdictionFor(profile.country);
  const sent = request.sentAt ? formatDate(request.sentAt) : formatDate(request.createdAt);

  return {
    subject: `Follow-up: erasure request sent ${sent} (${profile.fullName})`,
    body: `Hello ${request.brokerName} privacy team,

I contacted you on ${sent} asking you to delete my personal information and stop selling or publishing it. I have not received a response, and the listing is still visible.

My original request is repeated below, in case it did not reach the right person.

${request.body}

As a reminder, ${legal.law} requires you to answer within ${legal.deadline}. If I do not hear back within ten business days of this message, I will file a complaint with ${legal.regulator}.

Thank you,
${signature(profile)}`,
  };
}

export function mailtoLink(email: string, subject: string, body: string): string {
  // Most mail clients cap the body length; trim generously rather than fail.
  const safeBody = body.length > 1800 ? `${body.slice(0, 1800)}\n\n[Message continues in your email client]` : body;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(safeBody)}`;
}
