import { BROKERS } from "./brokers";
import type {
  BreachExposure,
  Broker,
  Category,
  DataType,
  Finding,
  Profile,
  Risk,
  ScanResult,
} from "./types";
import { DATA_LABELS } from "./types";
import { BREACH_CATALOG } from "./breaches";

/* ────────────────────────────────────────────────────────────────────────────
 * Deterministic matching model
 *
 * The scan is seeded from the profile, so the same person always gets the same
 * report, like a real crawl would. Coverage values in `lib/brokers.ts` stand in
 * for the share of adults each source is known to hold.
 *
 * To run against live data, replace `runScan` with a provider call (e.g. a data
 * removal API) and map its response into `ScanResult`. Everything downstream
 * (scoring, requests, tracking) stays the same.
 * ──────────────────────────────────────────────────────────────────────────── */

export function hash32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

const SEARCH_IDS = new Set(["google-search", "bing-search", "wayback", "gravatar"]);

function inspectUrlFor(broker: Broker, profile: Profile): string {
  if (SEARCH_IDS.has(broker.id)) {
    if (broker.id === "gravatar" && profile.usernames[0]) {
      return `https://gravatar.com/${encodeURIComponent(profile.usernames[0])}`;
    }
    if (broker.id === "bing-search") {
      return `https://www.bing.com/search?q=${encodeURIComponent(
        `"${profile.fullName}" ${profile.city}`,
      )}`;
    }
    if (broker.id === "google-search") {
      return `https://www.google.com/search?q=${encodeURIComponent(
        `"${profile.fullName}" ${profile.city}`,
      )}`;
    }
    return "https://web.archive.org/";
  }
  // A site-restricted search is the honest way to "see" a listing without
  // inventing deep links that may have moved.
  return `https://www.google.com/search?q=${encodeURIComponent(
    `site:${broker.domain.replace(/^www\./, "")} "${profile.fullName}"`,
  )}`;
}

function dataAvailable(profile: Profile): Record<DataType, boolean> {
  const hasCity = Boolean(profile.city);
  const hasEmail = profile.emails.length > 0;
  const hasPhone = profile.phones.length > 0;
  const hasHandle = profile.usernames.length > 0;
  return {
    fullName: true,
    city: hasCity,
    homeAddress: hasCity,
    formerAddresses: hasCity,
    phone: hasPhone,
    email: hasEmail,
    age: true,
    relatives: true,
    associates: true,
    employer: true,
    jobTitle: true,
    salary: true,
    propertyRecords: hasCity,
    courtRecords: true,
    marriageRecords: true,
    voterRecord: hasCity,
    socialProfiles: hasHandle || true,
    photos: true,
    usernames: hasHandle,
    interests: true,
    purchaseHistory: true,
    locationHistory: true,
    deviceId: true,
    ipAddress: true,
    politicalAffinity: true,
    credentials: hasEmail,
    passwordHash: hasEmail,
  };
}

const CATEGORY_WEIGHT: Record<Category, number> = {
  "people-search": 2,
  marketing: 2,
  adtech: 0.8,
  breach: 3,
  "public-records": 1,
  search: 1,
};

const DATA_WEIGHT: Partial<Record<DataType, number>> = {
  homeAddress: 1.5,
  formerAddresses: 1,
  phone: 1,
  relatives: 0.5,
  associates: 0.4,
  courtRecords: 1,
  propertyRecords: 1,
  credentials: 3,
  passwordHash: 3,
  salary: 1,
  voterRecord: 1,
  marriageRecords: 0.5,
  politicalAffinity: 0.5,
  purchaseHistory: 0.4,
  deviceId: 0.5,
  ipAddress: 0.4,
  locationHistory: 0.5,
  photos: 0.4,
  employer: 0.5,
  jobTitle: 0.3,
  socialProfiles: 0.4,
  usernames: 0.2,
  interests: 0.2,
};

export function riskScore(category: Category, data: DataType[]): number {
  return data.reduce(
    (total, type) => total + (DATA_WEIGHT[type] ?? 0),
    CATEGORY_WEIGHT[category],
  );
}

function riskFor(category: Category, data: DataType[]): Risk {
  const score = riskScore(category, data);
  if (score >= 5) return "high";
  if (score >= 3.2) return "medium";
  return "low";
}

function summarise(broker: Broker, data: DataType[]): string {
  const list = data
    .filter((type) => type !== "fullName")
    .slice(0, 4)
    .map((type) => DATA_LABELS[type].toLowerCase());

  const lead = list.length
    ? `Publishes your ${list.slice(0, -1).join(", ")}${list.length > 1 ? " and " : ""}${list[list.length - 1]}`
    : "Publishes a public profile built from your name";

  switch (broker.category) {
    case "people-search":
      return `${lead} on a page that anyone can look up by name.`;
    case "marketing":
      return `${lead}, held in a marketing profile that can be bought or licensed.`;
    case "adtech":
      return `${lead}, attached to your device and used to target advertising.`;
    case "public-records":
      return `${lead}. Public by law, but aggregated here for easy lookup.`;
    case "search":
      return `${lead} in search results and cached copies of pages.`;
    default:
      return `${lead}.`;
  }
}

function buildBreaches(profile: Profile, seed: number): BreachExposure[] {
  if (profile.emails.length === 0) return [];
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const pool = [...BREACH_CATALOG];
  const count = 2 + Math.floor(rand() * 3);
  const picked: BreachExposure[] = [];

  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const index = Math.floor(rand() * pool.length);
    const [item] = pool.splice(index, 1);
    const hardened = rand() > 0.45;
    picked.push({
      ...item,
      id: `breach-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      risk: hardened ? "medium" : "high",
    });
  }

  return picked;
}

export type RawProfileInput = {
  fullName?: string;
  city?: string;
  region?: string;
  country?: string;
  emails?: string | string[];
  phones?: string | string[];
  usernames?: string | string[];
};

export function normaliseProfile(input: RawProfileInput): Profile {
  const clean = (value: unknown): string =>
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

  const split = (value: unknown, pattern: RegExp): string[] => {
    if (Array.isArray(value)) return value.flatMap((v) => split(v, pattern));
    if (typeof value !== "string") return [];
    return value
      .split(pattern)
      .map((part) => part.trim())
      .filter(Boolean);
  };

  return {
    fullName: clean(input.fullName),
    city: clean(input.city),
    region: clean(input.region),
    country: clean(input.country) || "United States",
    // Emails and handles never contain spaces; phone numbers usually do.
    emails: Array.from(
      new Set(split(input.emails, /[,;\s]+/).map((email) => email.toLowerCase())),
    ).slice(0, 5),
    phones: Array.from(
      new Set(
        split(input.phones, /[,;\n]+/)
          .map((phone) => phone.replace(/\s+/g, " ").trim())
          .filter((phone) => phone.replace(/\D/g, "").length >= 5),
      ),
    ).slice(0, 4),
    usernames: Array.from(
      new Set(
        split(input.usernames, /[,;\s]+/).map((handle) => handle.replace(/^@/, "").trim()),
      ),
    ).filter(Boolean).slice(0, 5),
  };
}

export function runScan(rawProfile: RawProfileInput): ScanResult {
  const profile = normaliseProfile(rawProfile);
  const seed = hash32(
    `${profile.fullName.toLowerCase()}|${profile.city.toLowerCase()}|${profile.emails[0] ?? ""}`,
  );
  const available = dataAvailable(profile);
  const hasLocation = Boolean(profile.city);
  const findings: Finding[] = [];

  for (const broker of BROKERS) {
    const rand = mulberry32(hash32(`${seed}:${broker.id}`));

    // Sources need enough signal to plausibly hold a record.
    if (broker.category === "people-search" && !hasLocation) continue;
    if (broker.category === "marketing" && profile.emails.length === 0 && profile.phones.length === 0)
      continue;
    if (broker.category === "adtech" && profile.emails.length === 0 && !hasLocation) continue;
    if (broker.id === "zoominfo" || broker.id === "apollo" || broker.id === "lusha") {
      if (profile.emails.length === 0) continue;
    }
    if (broker.id === "gravatar" && profile.emails.length === 0) continue;

    const probability = Math.min(0.97, broker.coverage * 0.92 + 0.08);
    if (rand() > probability) continue;

    // Which of the source's fields are visible for this person.
    const seen: DataType[] = ["fullName"];
    for (const type of broker.data) {
      if (type === "fullName") continue;
      if (!available[type]) continue;
      if (rand() > 0.86) continue;
      seen.push(type);
    }
    if (seen.length < 3) {
      for (const type of broker.data) {
        if (seen.length >= 3) break;
        if (available[type] && !seen.includes(type)) seen.push(type);
      }
    }

    const firstSeenDays = 280 + Math.floor(rand() * 2200);
    const lastSeenDays = Math.floor(rand() * 26);

    findings.push({
      id: `${broker.id}`,
      brokerId: broker.id,
      broker: broker.name,
      domain: broker.domain,
      category: broker.category,
      data: seen,
      risk: riskFor(broker.category, seen),
      effort: broker.effort,
      fix: broker.category === "adtech" ? "form" : broker.category === "public-records" || broker.category === "search" ? "review" : broker.email ? "email" : "form",
      removalUrl: broker.removalUrl,
      contactEmail: broker.email,
      inspectUrl: inspectUrlFor(broker, profile),
      firstSeen: daysAgo(firstSeenDays),
      lastSeen: daysAgo(lastSeenDays),
      summary: summarise(broker, seen),
      note: broker.note,
    });
  }

  // A scan should always return something usable for a valid profile.
  if (findings.length < 6 && profile.fullName) {
    const filler = [...BROKERS]
      .filter((b) => b.category === "people-search" || b.category === "marketing")
      .sort((a, b) => b.coverage - a.coverage)
      .filter((b) => !findings.some((f) => f.brokerId === b.id));
    for (const broker of filler) {
      if (findings.length >= 6) break;
      const seen = Array.from(new Set<DataType>(["fullName", ...broker.data.filter((d) => available[d])])).slice(0, 5);
      findings.push({
        id: broker.id,
        brokerId: broker.id,
        broker: broker.name,
        domain: broker.domain,
        category: broker.category,
        data: seen,
        risk: riskFor(broker.category, seen),
        effort: broker.effort,
        fix: broker.email ? "email" : "form",
        removalUrl: broker.removalUrl,
        contactEmail: broker.email,
        inspectUrl: inspectUrlFor(broker, profile),
        firstSeen: daysAgo(400 + (hash32(broker.id) % 1500)),
        lastSeen: daysAgo(hash32(broker.id) % 25),
        summary: summarise(broker, seen),
        note: broker.note,
      });
    }
  }

  const order: Record<Risk, number> = { high: 0, medium: 1, low: 2 };
  findings.sort(
    (a, b) => order[a.risk] - order[b.risk] || b.data.length - a.data.length,
  );

  return {
    id: `scan_${(seed >>> 0).toString(36)}`,
    createdAt: new Date().toISOString(),
    profile,
    checked: BROKERS.length,
    findings,
    breaches: buildBreaches(profile, seed),
    demo: true,
  };
}

export function riskScoreLabel(finding: Finding): number {
  return Math.round(riskScore(finding.category, finding.data) * 10) / 10;
}
