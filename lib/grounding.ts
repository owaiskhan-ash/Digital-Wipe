/**
 * Turns what the model wrote into rows in the report.
 *
 * Everything here is pure so it can be checked without a network: the caller
 * resolves Google's grounding redirects first and hands the results in.
 *
 * The rule this module exists to enforce: a page the search found is only
 * dropped when there is genuinely nothing to show — no URL at all, no domain
 * anywhere, or the same URL twice. A model that writes `lbb.in` instead of
 * `https://lbb.in/` has still found a page, and it used to disappear silently.
 */

export type ShapedMention = {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  contactEmail?: string;
};

export type DroppedTally = {
  /** Cited entries that carried no usable URL. */
  noUrl: number;
  /** A Google redirect that never resolved and whose title named no domain. */
  unresolved: number;
  /** The same page was cited twice. */
  duplicate: number;
  total: number;
};

const RESERVED_OR_FAKE_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "example.edu",
  "test.com",
  "yourdomain.com",
  "domain.com",
  "company.com",
  "website.com",
  "localhost",
  "invalid",
]);

/** Hosts that are search engines rather than the pages themselves. */
const SEARCH_ENGINE_HOSTS = [
  "duckduckgo.com",
  "google.com",
  "google.co.in",
  "google.co.uk",
  "bing.com",
  "yahoo.com",
  "search.brave.com",
  "serper.dev",
  "tavily.com",
];

export function isValidPublicDomain(domain: string): boolean {
  const clean = domain.toLowerCase().trim();
  if (!clean || !clean.includes(".")) return false;
  if (clean.endsWith(".web") || clean.endsWith(".invalid") || clean.endsWith(".local")) {
    return false;
  }
  if (RESERVED_OR_FAKE_DOMAINS.has(clean)) return false;
  for (const reserved of RESERVED_OR_FAKE_DOMAINS) {
    if (clean.endsWith(`.${reserved}`)) return false;
  }
  if (SEARCH_ENGINE_HOSTS.some((host) => clean === host || clean.endsWith(`.${host}`))) {
    return false;
  }
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean);
}

export function domainFromUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .trim();
}

/** Google hands back grounding citations as opaque redirects. */
export function isGoogleRedirect(url: string): boolean {
  return url.toLowerCase().includes("vertexaisearch.cloud.google.com");
}

const BARE_HOST = /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i;

/**
 * A model writes URLs in every shape but a clean one: without a scheme, with a
 * trailing full stop, wrapped in the punctuation of the surrounding sentence.
 * Returns null only when there is no page to point at.
 */
export function normaliseUrl(raw: string): string | null {
  const value = raw
    .trim()
    .replace(/^[<("'[\]\s]+/, "")
    .replace(/[>)"'\]\s.,;:]+$/, "");
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (BARE_HOST.test(value)) return `https://${value}`;
  return null;
}

/** The first domain-looking token in a page title, if it names one. */
export function domainFromTitle(title: string): string {
  const match = title.toLowerCase().match(/(?:[a-z0-9-]+\.)+[a-z]{2,}/g);
  if (!match) return "";
  for (const candidate of match) {
    const clean = candidate.replace(/^www\./, "");
    if (isValidPublicDomain(clean)) return clean;
  }
  return "";
}

export function parseJsonArrayLoose(text: string): unknown[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const bracketed = body.slice(body.indexOf("["), body.lastIndexOf("]") + 1);

  for (const candidate of [body, bracketed]) {
    if (!candidate.trim()) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") {
        const shaped = parsed as { results?: unknown[]; findings?: unknown[] };
        if (Array.isArray(shaped.results)) return shaped.results;
        if (Array.isArray(shaped.findings)) return shaped.findings;
      }
    } catch {
      // Truncated or wrapped: fall through to the object scan below.
    }
  }

  const items: unknown[] = [];
  for (const match of body.matchAll(/\{[^{}]*\}/g)) {
    try {
      items.push(JSON.parse(match[0]));
    } catch {
      // A partial object at the cut-off point: skip it alone.
    }
  }
  return items;
}

/**
 * Shapes the model's list into report rows. `resolvedUrls[index]` is the
 * redirect target for `items[index]`, or the original URL when no resolution
 * was needed.
 */
export function shapeModelItems(
  items: unknown[],
  resolvedUrls: string[],
  targetValue: string,
  seenUrls: Set<string> = new Set()
): { mentions: ShapedMention[]; dropped: DroppedTally } {
  const mentions: ShapedMention[] = [];
  const dropped: DroppedTally = { noUrl: 0, unresolved: 0, duplicate: 0, total: 0 };

  items.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      dropped.total += 1;
      dropped.noUrl += 1;
      return;
    }

    const record = item as Record<string, unknown>;
    const rawUrl = normaliseUrl(
      String(record.url || record.inspectUrl || record.removalUrl || "")
    );
    if (!rawUrl) {
      dropped.total += 1;
      dropped.noUrl += 1;
      return;
    }

    const url = normaliseUrl(resolvedUrls[index] ?? "") ?? rawUrl;
    const title = String(record.title || record.broker || "").trim();

    let domain = domainFromUrl(url);
    if (isGoogleRedirect(url) || !isValidPublicDomain(domain)) {
      // The citation never resolved; the title usually still names the site.
      const fromTitle = domainFromTitle(title);
      if (!fromTitle) {
        dropped.total += 1;
        dropped.unresolved += 1;
        return;
      }
      domain = fromTitle;
    }

    const key = url.toLowerCase();
    if (seenUrls.has(key)) {
      dropped.total += 1;
      dropped.duplicate += 1;
      return;
    }
    seenUrls.add(key);

    const snippet =
      String(record.snippet || record.summary || "").trim() ||
      `This page publishes "${targetValue}".`;
    const contactEmail =
      typeof record.contactEmail === "string" && record.contactEmail.includes("@")
        ? record.contactEmail.trim()
        : undefined;

    mentions.push({ title: title || domain, url, domain, snippet, contactEmail });
  });

  return { mentions, dropped };
}
