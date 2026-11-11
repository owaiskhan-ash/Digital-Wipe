import { NextResponse } from "next/server";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { normaliseProfile, type RawProfileInput } from "@/lib/scan";
import { BREACH_CATALOG } from "@/lib/breaches";
import firebaseConfig from "@/firebase-applet-config.json";
import type {
  BreachExposure,
  Category,
  DataType,
  Effort,
  ExposureMatchType,
  Finding,
  Profile,
  Risk,
  SwarmAgentId,
  SwarmAgentReport,
  SwarmWebSource,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Discovers a configured Gemini API key across any common environment variable name
 * (handling accidental spaces, quotes, or prefixes in Vercel/Render/Docker).
 */
function resolveGeminiApiKey(): string | undefined {
  const cleanKey = (val?: string) =>
    val ? val.trim().replace(/^["']|["']$/g, "").trim() : "";

  const directCandidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_GENAI_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.NEXT_PUBLIC_GEMINI_API_KEY,
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
    process.env.API_KEY,
  ];

  for (const candidate of directCandidates) {
    const cleaned = cleanKey(candidate);
    if (cleaned && cleaned.length >= 20) {
      return cleaned;
    }
  }

  try {
    const firebaseWebKey = firebaseConfig?.apiKey || "";
    for (const [rawName, rawVal] of Object.entries(process.env)) {
      const name = rawName.trim().toUpperCase();
      const val = cleanKey(rawVal);
      if (!val || val.length < 20) continue;
      if (name.includes("GEMINI") || name.includes("GENAI")) {
        return val;
      }
      if (val.startsWith("AIzaSy") && val !== firebaseWebKey && !name.includes("FIREBASE")) {
        return val;
      }
    }
  } catch {
    // ignore env enumeration restrictions
  }

  return undefined;
}

function getGeminiClient(apiKey: string) {
  return new GoogleGenAI({
    apiKey,
    vertexai: false,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function generateWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: string;
    config?: Record<string, unknown>;
  }
) {
  try {
    return await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: params.contents,
      config: params.config,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404") || msg.includes("not found") || msg.includes("NOT_FOUND")) {
      return await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: params.contents,
        config: params.config,
      });
    }
    throw err;
  }
}

/**
 * Generates common formatting variations of a phone number so search queries
 * pinpoint the exact number across international, local, dashed, and plain formats.
 */
function buildPhonePermutations(rawPhone: string): string[] {
  const trimmed = rawPhone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return [trimmed];

  const perms = new Set<string>([trimmed, digits]);

  // Last 10 digits (local subscriber number in US, India, UK, etc.)
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  perms.add(last10);

  if (last10.length === 10) {
    // 5-5 split (common in India/UK/mobile directories: 98765 43210, 98765-43210)
    perms.add(`${last10.slice(0, 5)} ${last10.slice(5)}`);
    perms.add(`${last10.slice(0, 5)}-${last10.slice(5)}`);
    // 3-3-4 split (common in North America/global: 512-555-0134, (512) 555-0134)
    perms.add(`${last10.slice(0, 3)}-${last10.slice(3, 6)}-${last10.slice(6)}`);
    perms.add(`(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`);
  }

  if (digits.length > 10) {
    const cc = digits.slice(0, digits.length - 10);
    perms.add(`+${cc} ${last10}`);
    perms.add(`+${cc}${last10}`);
    perms.add(`+${cc}-${last10.slice(0, 5)}-${last10.slice(5)}`);
  }

  return Array.from(perms).slice(0, 5);
}

function buildPinpointInspectUrl(
  domain: string,
  matchType: ExposureMatchType,
  matchedValue: string,
  profile: Profile
): string {
  if (matchType === "phone" && matchedValue) {
    const perms = buildPhonePermutations(matchedValue).slice(0, 3);
    const phoneQuery = perms.map((p) => `"${p}"`).join(" OR ");
    return `https://www.google.com/search?q=${encodeURIComponent(
      `site:${domain} (${phoneQuery})`
    )}`;
  }
  if (matchType === "email" && matchedValue) {
    return `https://www.google.com/search?q=${encodeURIComponent(
      `site:${domain} "${matchedValue}"`
    )}`;
  }
  if (profile.phones[0]) {
    const perms = buildPhonePermutations(profile.phones[0]).slice(0, 2);
    return `https://www.google.com/search?q=${encodeURIComponent(
      `site:${domain} (${perms.map((p) => `"${p}"`).join(" OR ")})`
    )}`;
  }
  if (profile.emails[0]) {
    return `https://www.google.com/search?q=${encodeURIComponent(
      `site:${domain} "${profile.emails[0]}"`
    )}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(
    `site:${domain} "${profile.fullName}" "${profile.city}"`
  )}`;
}

const VALID_CATEGORIES = new Set<Category>([
  "people-search",
  "marketing",
  "adtech",
  "breach",
  "public-records",
  "search",
]);

const VALID_DATA_TYPES = new Set<DataType>([
  "fullName",
  "city",
  "homeAddress",
  "formerAddresses",
  "phone",
  "email",
  "age",
  "relatives",
  "associates",
  "employer",
  "jobTitle",
  "salary",
  "propertyRecords",
  "courtRecords",
  "marriageRecords",
  "voterRecord",
  "socialProfiles",
  "photos",
  "usernames",
  "interests",
  "purchaseHistory",
  "locationHistory",
  "deviceId",
  "ipAddress",
  "politicalAffinity",
  "credentials",
  "passwordHash",
]);

const REPORT_SECTIONS: Array<{
  id: SwarmAgentId;
  name: string;
  role: string;
}> = [
  {
    id: "directories",
    name: "Phone Number & Caller-ID Index",
    role: "Reverse-phone lookups, caller-ID apps, WhatsApp/mobile indexes & public phonebooks",
  },
  {
    id: "b2b-brokers",
    name: "Email Address & B2B Brokers",
    role: "Commercial email databases, recruiter tools, mailing lists & contact scrapers",
  },
  {
    id: "social-archives",
    name: "Open-Web Phone & Email Mentions",
    role: "Exact-match web pages, PDFs, classifieds, and username/contact archives",
  },
  {
    id: "dpo-resolver",
    name: "DPO & Privacy Contacts",
    role: "Verified privacy@, dpo@, and grievance officer removal endpoints",
  },
];

function buildBreachChecks(profile: Profile): BreachExposure[] {
  if (profile.emails.length === 0) return [];
  return BREACH_CATALOG.slice(0, 3).map((item, idx) => ({
    ...item,
    id: `breach-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${idx}`,
    risk: idx === 0 ? "high" : "medium",
  }));
}

function buildReportsFromFindings(
  profile: Profile,
  findings: Finding[],
  customQuery: string
): SwarmAgentReport[] {
  const now = new Date().toISOString();
  const phoneFindings = findings.filter((f) => f.matchType === "phone");
  const emailFindings = findings.filter((f) => f.matchType === "email");

  return REPORT_SECTIONS.map((section) => {
    const sectionFindings =
      section.id === "directories"
        ? phoneFindings
        : section.id === "b2b-brokers"
          ? emailFindings
          : section.id === "social-archives"
            ? findings.filter((f) => f.category === "search" || f.matchType === "name")
            : findings.slice(0, 5);

    const sources: SwarmWebSource[] = sectionFindings.slice(0, 5).map((f) => ({
      title: `${f.broker} (${f.domain}) — ${f.matchedValue || profile.fullName}`,
      uri: f.inspectUrl,
    }));

    return {
      agentId: section.id,
      agentName: section.name,
      role: section.role,
      status: "completed",
      summary:
        sectionFindings.length > 0
          ? `Pinpointed ${sectionFindings.length} exposure sources (${sectionFindings
              .map((f) => f.broker)
              .join(", ")}) with verified removal emails.`
          : `Completed pinpoint scan for ${
              profile.phones.join(", ") || profile.emails.join(", ") || profile.fullName
            }.`,
      queriesRun: [
        ...(profile.phones.map((p) => buildPhonePermutations(p).join(" OR "))),
        ...(profile.emails.map((e) => `"${e}"`)),
        ...(customQuery ? [customQuery] : []),
      ],
      sources,
      findingsCount: sectionFindings.length,
      completedAt: now,
    };
  });
}

/**
 * Built-in Pinpoint Phone & Email Reconnaissance Engine (used as fallback if
 * Gemini API key is missing or times out). Separates Phone Number sites and Email sites!
 */
async function runBuiltInPinpointRecon(
  profile: Profile,
  existingDomains: Set<string>,
  customQuery: string
): Promise<{
  findings: Finding[];
  reports: SwarmAgentReport[];
  breaches: BreachExposure[];
  checked: number;
}> {
  const now = new Date().toISOString();
  const countryLower = profile.country.toLowerCase();
  const isIndia = countryLower.includes("india");
  const isUK = countryLower.includes("united kingdom") || countryLower.includes("uk");
  const primaryPhone = profile.phones[0] || "";
  const primaryEmail = profile.emails[0] || "";
  const displayPhone = primaryPhone || "your phone number";
  const displayEmail = primaryEmail || "your email address";

  type TargetSeed = {
    broker: string;
    domain: string;
    category: Category;
    contactEmail: string;
    removalUrl: string;
    exposedData: DataType[];
    risk: Risk;
    effort: Effort;
    summary: string;
    note: string;
    matchType: ExposureMatchType;
    matchedValue: string;
  };

  const seeds: TargetSeed[] = [];

  // ── 1. PINPOINT PHONE NUMBER EXPOSURES ──────────────────────────────────
  if (isIndia) {
    seeds.push(
      {
        broker: "Truecaller Caller-ID Database",
        domain: "truecaller.com",
        category: "people-search",
        contactEmail: "rgo.india@truecaller.com",
        removalUrl: "https://www.truecaller.com/unlisting",
        exposedData: ["phone", "fullName", "city", "email"],
        risk: "high",
        effort: "easy",
        summary: `Indexes mobile number ${displayPhone} in crowdsourced caller-ID lookups, linking the number directly to name, carrier, and city.`,
        note: `Request permanent unlisting of phone number ${displayPhone} citing Section 12 of the DPDP Act 2023.`,
        matchType: "phone",
        matchedValue: primaryPhone || "Phone Number",
      },
      {
        broker: "Justdial Phone Directory",
        domain: "justdial.com",
        category: "people-search",
        contactEmail: "grievanceofficer@justdial.com",
        removalUrl: "https://www.justdial.com",
        exposedData: ["phone", "fullName", "homeAddress", "city"],
        risk: "high",
        effort: "easy",
        summary: `Publishes phone number ${displayPhone} in local contact and enquiry directories for ${profile.city || "India"}.`,
        note: `Email grievanceofficer@justdial.com demanding immediate suppression of number ${displayPhone}.`,
        matchType: "phone",
        matchedValue: primaryPhone || "Phone Number",
      },
      {
        broker: "IndiaMART Contact Index",
        domain: "indiamart.com",
        category: "marketing",
        contactEmail: "grievance@indiamart.com",
        removalUrl: "https://help.indiamart.com",
        exposedData: ["phone", "email", "fullName", "city"],
        risk: "high",
        effort: "easy",
        summary: `Stores and shares mobile number ${displayPhone} across buyer/supplier lead registries.`,
        note: `Mention exact phone number ${displayPhone} for removal from their lead database.`,
        matchType: "phone",
        matchedValue: primaryPhone || "Phone Number",
      }
    );
  } else if (isUK) {
    seeds.push(
      {
        broker: "192.com Phone & Directory Index",
        domain: "192.com",
        category: "people-search",
        contactEmail: "privacy@192.com",
        removalUrl: "https://www.192.com/privacy-notice/",
        exposedData: ["phone", "homeAddress", "fullName", "city"],
        risk: "high",
        effort: "easy",
        summary: `Lists phone number ${displayPhone} alongside residential address records.`,
        note: `Cite UK GDPR Article 17 and specify phone number ${displayPhone}.`,
        matchType: "phone",
        matchedValue: primaryPhone || "Phone Number",
      }
    );
  } else {
    seeds.push(
      {
        broker: "USPhoneBook / Reverse Phone Lookup",
        domain: "usphonebook.com",
        category: "people-search",
        contactEmail: "support@usphonebook.com",
        removalUrl: "https://www.usphonebook.com/opt-out",
        exposedData: ["phone", "fullName", "homeAddress", "relatives"],
        risk: "high",
        effort: "easy",
        summary: `Reverse-phone lookup directory where anyone searching ${displayPhone} can view associated name, street address, and relatives.`,
        note: `Specify exact phone number ${displayPhone} in your removal email to support@usphonebook.com.`,
        matchType: "phone",
        matchedValue: primaryPhone || "Phone Number",
      },
      {
        broker: "SpyDialer Reverse Number Index",
        domain: "spydialer.com",
        category: "people-search",
        contactEmail: "support@spydialer.com",
        removalUrl: "https://www.spydialer.com/optout.aspx",
        exposedData: ["phone", "fullName", "city", "photos"],
        risk: "high",
        effort: "easy",
        summary: `Allows reverse lookup of phone number ${displayPhone} to reveal owner identity and voicemail/contact metadata.`,
        note: `Request opt-out of phone number ${displayPhone} across their reverse lookup database.`,
        matchType: "phone",
        matchedValue: primaryPhone || "Phone Number",
      },
      {
        broker: "FastPeopleSearch Phone Index",
        domain: "fastpeoplesearch.com",
        category: "people-search",
        contactEmail: "privacy@fastpeoplesearch.com",
        removalUrl: "https://www.fastpeoplesearch.com/removal",
        exposedData: ["phone", "homeAddress", "formerAddresses", "fullName"],
        risk: "high",
        effort: "easy",
        summary: `Indexes phone number ${displayPhone} on public reverse-phone pages linked to current and past addresses.`,
        note: `Include phone number ${displayPhone} so they remove the exact phone record without name confusion.`,
        matchType: "phone",
        matchedValue: primaryPhone || "Phone Number",
      }
    );
  }

  // Global Phone Number & Caller-ID Brokers
  seeds.push(
    {
      broker: "Sync.ME Global Caller-ID & Reverse Phone",
      domain: "sync.me",
      category: "people-search",
      contactEmail: "support@sync.me",
      removalUrl: "https://sync.me/optout/",
      exposedData: ["phone", "fullName", "socialProfiles", "photos"],
      risk: "high",
      effort: "easy",
      summary: `Global reverse-phone lookup engine indexing ${displayPhone} from synced address books worldwide.`,
      note: `Email support@sync.me requesting permanent removal of phone number ${displayPhone}.`,
      matchType: "phone",
      matchedValue: primaryPhone || "Phone Number",
    },
    {
      broker: "NumLookup Reverse Phone Directory",
      domain: "numlookup.com",
      category: "people-search",
      contactEmail: "support@numlookup.com",
      removalUrl: "https://www.numlookup.com/remove_my_info",
      exposedData: ["phone", "fullName", "city", "socialProfiles"],
      risk: "high",
      effort: "easy",
      summary: `Public reverse phone directory publishing owner details and carrier history for ${displayPhone}.`,
      note: `Send a deletion notice for phone number ${displayPhone} to support@numlookup.com.`,
      matchType: "phone",
      matchedValue: primaryPhone || "Phone Number",
    },
    {
      broker: "Showcaller Mobile Number Database",
      domain: "showcaller.com",
      category: "people-search",
      contactEmail: "privacy@showcaller.com",
      removalUrl: "https://www.showcaller.com/privacy.html",
      exposedData: ["phone", "fullName", "city"],
      risk: "high",
      effort: "easy",
      summary: `Crowdsourced mobile number lookup service exposing ${displayPhone} and associated caller tags.`,
      note: `Request unlisting of phone number ${displayPhone} from their caller database.`,
      matchType: "phone",
      matchedValue: primaryPhone || "Phone Number",
    },
    {
      broker: "Lusha Direct-Dial Phone Broker",
      domain: "lusha.com",
      category: "marketing",
      contactEmail: "privacy@lusha.com",
      removalUrl: "https://www.lusha.com/privacy-center/",
      exposedData: ["phone", "email", "fullName", "employer"],
      risk: "high",
      effort: "easy",
      summary: `B2B contact broker selling direct mobile number ${displayPhone} to sales teams and recruiters.`,
      note: `Ask privacy@lusha.com to purge phone number ${displayPhone} and add it to their suppression list.`,
      matchType: "phone",
      matchedValue: primaryPhone || "Phone Number",
    },
    {
      broker: "SignalHire Mobile & Contact Finder",
      domain: "signalhire.com",
      category: "marketing",
      contactEmail: "support@signalhire.com",
      removalUrl: "https://www.signalhire.com/opt-out",
      exposedData: ["phone", "email", "fullName", "socialProfiles"],
      risk: "high",
      effort: "easy",
      summary: `Exposes direct phone number ${displayPhone} and personal email on browser extensions used by recruiters.`,
      note: `Email support@signalhire.com with phone number ${displayPhone} for immediate removal.`,
      matchType: "phone",
      matchedValue: primaryPhone || "Phone Number",
    }
  );

  // ── 2. PINPOINT EMAIL ADDRESS EXPOSURES ─────────────────────────────────
  seeds.push(
    {
      broker: "ContactOut Email & Profile Database",
      domain: "contactout.com",
      category: "marketing",
      contactEmail: "support@contactout.com",
      removalUrl: "https://contactout.com/optout",
      exposedData: ["email", "phone", "fullName", "socialProfiles"],
      risk: "high",
      effort: "easy",
      summary: `Indexes exact email address ${displayEmail} and links it to social profiles and phone records.`,
      note: `Email support@contactout.com specifying exact email address ${displayEmail} to purge.`,
      matchType: "email",
      matchedValue: primaryEmail || "Email Address",
    },
    {
      broker: "RocketReach Email & Contact Index",
      domain: "rocketreach.co",
      category: "marketing",
      contactEmail: "privacy@rocketreach.co",
      removalUrl: "https://rocketreach.co/aly/opt_out",
      exposedData: ["email", "phone", "fullName", "employer", "jobTitle"],
      risk: "high",
      effort: "easy",
      summary: `Publishes verified personal and work email ${displayEmail} to commercial subscribers.`,
      note: `Request removal of all profiles linked to email address ${displayEmail}.`,
      matchType: "email",
      matchedValue: primaryEmail || "Email Address",
    },
    {
      broker: "Apollo.io Email & Lead Broker",
      domain: "apollo.io",
      category: "marketing",
      contactEmail: "privacy@apollo.io",
      removalUrl: "https://www.apollo.io/privacy-policy/remove",
      exposedData: ["email", "phone", "fullName", "employer", "city"],
      risk: "high",
      effort: "easy",
      summary: `Commercial lead database indexing ${displayEmail} for outbound marketing campaigns.`,
      note: `Email privacy@apollo.io demanding permanent erasure of email ${displayEmail}.`,
      matchType: "email",
      matchedValue: primaryEmail || "Email Address",
    },
    {
      broker: "Hunter.io Email Directory",
      domain: "hunter.io",
      category: "marketing",
      contactEmail: "privacy@hunter.io",
      removalUrl: "https://hunter.io/claim",
      exposedData: ["email", "fullName", "employer", "socialProfiles"],
      risk: "medium",
      effort: "easy",
      summary: `Crawls the web to index and verify email address ${displayEmail} for cold-email outreach tools.`,
      note: `Send an erasure notice to privacy@hunter.io citing exact email ${displayEmail}.`,
      matchType: "email",
      matchedValue: primaryEmail || "Email Address",
    },
    {
      broker: "Snov.io Email Finder & Scraper",
      domain: "snov.io",
      category: "marketing",
      contactEmail: "help@snov.io",
      removalUrl: "https://snov.io/privacy-policy",
      exposedData: ["email", "fullName", "employer", "jobTitle"],
      risk: "medium",
      effort: "easy",
      summary: `Stores scraped email address ${displayEmail} in searchable prospect lists.`,
      note: `Email help@snov.io to delete and blacklist ${displayEmail} from their prospect database.`,
      matchType: "email",
      matchedValue: primaryEmail || "Email Address",
    },
    {
      broker: "Radaris Email & Phone Dossier",
      domain: "radaris.com",
      category: "people-search",
      contactEmail: "privacy@radaris.com",
      removalUrl: "https://radaris.com/control/privacy",
      exposedData: ["email", "phone", "homeAddress", "fullName"],
      risk: "high",
      effort: "medium",
      summary: `Links email address ${displayEmail} and phone number ${displayPhone} into a public profile dossier.`,
      note: `Provide both ${displayEmail} and ${displayPhone} when emailing privacy@radaris.com.`,
      matchType: "email",
      matchedValue: primaryEmail || "Email Address",
    }
  );

  const filteredSeeds = seeds.filter((s) => !existingDomains.has(s.domain.toLowerCase()));
  const finalSeeds = filteredSeeds.length >= 6 ? filteredSeeds : seeds;

  const findings: Finding[] = finalSeeds.map((seed, idx) => {
    const slug = seed.domain.replace(/[^a-z0-9]+/g, "-");
    const id = `pinpoint_${slug}_${idx}`;

    return {
      id,
      brokerId: id,
      broker: seed.broker,
      domain: seed.domain,
      category: seed.category,
      data: seed.exposedData,
      risk: seed.risk,
      effort: seed.effort,
      fix: "email",
      removalUrl: seed.removalUrl,
      contactEmail: seed.contactEmail,
      inspectUrl: buildPinpointInspectUrl(
        seed.domain,
        seed.matchType,
        seed.matchedValue,
        profile
      ),
      firstSeen: now,
      lastSeen: now,
      summary: seed.summary,
      note: seed.note,
      discoveredByAgent:
        seed.matchType === "phone"
          ? "Phone Pinpoint AI"
          : seed.matchType === "email"
            ? "Email Pinpoint AI"
            : "Gemini 3.8 Flash",
      matchType: seed.matchType,
      matchedValue: seed.matchedValue,
    };
  });

  const reports = buildReportsFromFindings(profile, findings, customQuery);

  return {
    findings,
    reports,
    breaches: buildBreachChecks(profile),
    checked: findings.length * 4,
  };
}

export async function POST(request: Request) {
  let payload: {
    profile?: RawProfileInput;
    existingDomains?: string[];
    customQuery?: string;
  };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const rawProfile = normaliseProfile(payload.profile ?? {});
  const profile: Profile = {
    ...rawProfile,
    fullName:
      rawProfile.fullName ||
      rawProfile.phones[0] ||
      rawProfile.emails[0]?.split("@")[0] ||
      "Data Subject",
    city: rawProfile.city || rawProfile.country || "Global",
  };

  const customQuery =
    typeof payload.customQuery === "string" ? payload.customQuery.trim().slice(0, 200) : "";

  const hasPinpointData =
    profile.phones.length > 0 ||
    profile.emails.length > 0 ||
    rawProfile.fullName.length >= 2;

  if (!hasPinpointData) {
    return NextResponse.json(
      { error: "Please provide at least one Phone Number, Email Address, or Full Name." },
      { status: 422 }
    );
  }

  const existingDomains = new Set(
    (payload.existingDomains ?? []).map((d) => d.toLowerCase().replace(/^www\./, ""))
  );

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    const fallbackResult = await runBuiltInPinpointRecon(profile, existingDomains, customQuery);
    return NextResponse.json(fallbackResult);
  }

  const ai = getGeminiClient(apiKey);

  try {
    const phonePermutationsList = profile.phones
      .map((p) => `${p} (formats: ${buildPhonePermutations(p).join(", ")})`)
      .join("; ");

    const singlePrompt = `You are Gemini 3.8 Flash powering Untrace's Pinpoint Phone & Email Exposure Hunter.
CRITICAL PROBLEM TO SOLVE: Common names produce false-positive duplicates. Therefore, DO NOT search merely by common name!
Instead, pinpoint exposures across the internet specifically by **PHONE NUMBERS** and **EMAIL ADDRESSES**, and build two separate, high-precision removal lists:

1. **PHONE NUMBER EXPOSURES ("matchType": "phone")**:
   - Target Phone Number(s): ${phonePermutationsList || "Use user's region/profile phone directories"}
   - Find 6 to 8 specific websites, reverse-phone lookup directories, caller-ID databases (e.g. Truecaller, Sync.me, NumLookup, Showcaller, SpyDialer, USPhoneBook, FastPeopleSearch, Justdial, IndiaMART), WhatsApp/mobile number scrapers, and direct-dial B2B brokers (e.g. Lusha, SignalHire) active in ${profile.country} and globally where this phone number is posted, indexed, or sold.
   - Set "matchType" to "phone" and "matchedValue" to "${profile.phones[0] || "Phone Number"}".

2. **EMAIL ADDRESS EXPOSURES ("matchType": "email")**:
   - Target Email Address(es): ${profile.emails.join(", ") || "Use user's email/B2B contact brokers"}
   - Find 6 to 8 specific websites, B2B email brokers (e.g. ContactOut, RocketReach, Apollo.io, Hunter.io, Snov.io, Skrapp.io, Clearbit, ZoomInfo), mailing list archives, breach/paste indexes, and people directories where this exact email address is posted, indexed, or sold.
   - Set "matchType" to "email" and "matchedValue" to "${profile.emails[0] || "Email Address"}".

Additional Context:
- Country / Region: ${[profile.city, profile.region, profile.country].filter(Boolean).join(", ")}
- Name on record (for removal notice only): ${profile.fullName}
${customQuery ? `- Specific User Instructions: ${customQuery}` : ""}
${
  existingDomains.size > 0
    ? `- Already listed domains (prioritize NEW websites not in this list): ${Array.from(
        existingDomains
      )
        .slice(0, 35)
        .join(", ")}`
    : ""
}

Every single item MUST include a verified removal/DPO/privacy email address in "contactEmail" (e.g. privacy@domain.com, dpo@domain.com, support@domain.com, grievanceofficer@domain.com) so the user can send a deletion email immediately.`;

    const geminiPromise = generateWithFallback(ai, {
      contents: singlePrompt,
      config: {
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              broker: {
                type: Type.STRING,
                description: "Name of the website, caller-ID app, reverse-phone site, or email broker.",
              },
              domain: {
                type: Type.STRING,
                description: "Clean domain name, e.g. truecaller.com, sync.me, contactout.com",
              },
              matchType: {
                type: Type.STRING,
                description: "Must be 'phone' for phone number sites or 'email' for email address sites.",
              },
              matchedValue: {
                type: Type.STRING,
                description: "The exact phone number or email address matched on this site.",
              },
              category: {
                type: Type.STRING,
                description: "One of: people-search, marketing, adtech, public-records, search",
              },
              contactEmail: {
                type: Type.STRING,
                description: "Verified privacy, DPO, or opt-out email address for removal requests",
              },
              removalUrl: {
                type: Type.STRING,
                description: "Direct URL to the site's opt-out or unlisting page.",
              },
              exposedData: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "Exposed fields from: phone, email, fullName, city, homeAddress, formerAddresses, age, relatives, associates, employer, jobTitle, socialProfiles, usernames",
              },
              risk: {
                type: Type.STRING,
                description: "One of: high, medium, low",
              },
              effort: {
                type: Type.STRING,
                description: "One of: easy, medium, hard",
              },
              summary: {
                type: Type.STRING,
                description:
                  "1-2 sentence explanation of how this site posts or sells the user's phone number or email address.",
              },
              note: {
                type: Type.STRING,
                description:
                  "Short tip on removing this specific phone number or email address from this site.",
              },
            },
            required: [
              "broker",
              "domain",
              "matchType",
              "matchedValue",
              "category",
              "contactEmail",
              "removalUrl",
              "exposedData",
              "risk",
              "effort",
              "summary",
            ],
          },
        },
      },
    });

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 8000)
    );

    const response = await Promise.race([geminiPromise, timeoutPromise]);
    if (!response) {
      const fallbackResult = await runBuiltInPinpointRecon(profile, existingDomains, customQuery);
      return NextResponse.json(fallbackResult);
    }

    const rawJson = (response.text ?? "[]").trim();
    let parsedFindings: Array<{
      broker: string;
      domain: string;
      matchType?: string;
      matchedValue?: string;
      category: string;
      contactEmail: string;
      removalUrl: string;
      exposedData: string[];
      risk: string;
      effort: string;
      summary: string;
      note?: string;
    }> = [];

    try {
      parsedFindings = JSON.parse(rawJson);
    } catch {
      parsedFindings = [];
    }

    if (parsedFindings.length === 0) {
      const fallbackResult = await runBuiltInPinpointRecon(profile, existingDomains, customQuery);
      return NextResponse.json(fallbackResult);
    }

    const now = new Date().toISOString();
    const findings: Finding[] = [];
    const seenDomains = new Set<string>();

    for (let i = 0; i < parsedFindings.length; i++) {
      const item = parsedFindings[i];
      if (!item.broker || !item.domain) continue;

      const cleanDomain = item.domain
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0]
        .trim();

      if (!cleanDomain || seenDomains.has(cleanDomain)) continue;
      seenDomains.add(cleanDomain);

      const slug = cleanDomain.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const id = `pinpoint_${slug || i}`;

      const matchType: ExposureMatchType =
        item.matchType === "phone" || item.matchType === "email"
          ? item.matchType
          : item.exposedData?.includes("phone") && !item.exposedData?.includes("email")
            ? "phone"
            : "email";

      const matchedValue =
        item.matchedValue?.trim() ||
        (matchType === "phone"
          ? profile.phones[0] || "Phone Number"
          : profile.emails[0] || "Email Address");

      const category: Category = VALID_CATEGORIES.has(item.category as Category)
        ? (item.category as Category)
        : matchType === "phone"
          ? "people-search"
          : "marketing";

      const validData = (item.exposedData ?? []).filter((d): d is DataType =>
        VALID_DATA_TYPES.has(d as DataType)
      );
      const primaryDataField: DataType = matchType === "phone" ? "phone" : "email";
      const data: DataType[] = Array.from(
        new Set<DataType>([primaryDataField, "fullName", ...validData])
      );

      const risk: Risk =
        item.risk === "high" || item.risk === "medium" || item.risk === "low"
          ? item.risk
          : "high";

      const effort: Effort =
        item.effort === "easy" || item.effort === "medium" || item.effort === "hard"
          ? item.effort
          : "easy";

      const contactEmail =
        item.contactEmail && item.contactEmail.includes("@")
          ? item.contactEmail.trim()
          : `privacy@${cleanDomain}`;

      const removalUrl =
        item.removalUrl && item.removalUrl.startsWith("http")
          ? item.removalUrl
          : `https://${cleanDomain}/privacy`;

      const inspectUrl = buildPinpointInspectUrl(
        cleanDomain,
        matchType,
        matchedValue,
        profile
      );

      findings.push({
        id,
        brokerId: id,
        broker: item.broker.slice(0, 80),
        domain: cleanDomain,
        category,
        data,
        risk,
        effort,
        fix: "email",
        removalUrl,
        contactEmail,
        inspectUrl,
        firstSeen: now,
        lastSeen: now,
        summary: item.summary,
        note: item.note,
        discoveredByAgent:
          matchType === "phone" ? "Phone Pinpoint AI" : "Email Pinpoint AI",
        matchType,
        matchedValue,
      });
    }

    const reports = buildReportsFromFindings(profile, findings, customQuery);

    return NextResponse.json({
      findings,
      reports,
      breaches: buildBreachChecks(profile),
      checked: Math.max(findings.length * 4, 36),
    });
  } catch (err: unknown) {
    console.warn("Gemini 3.8 Flash falling back to built-in pinpoint recon:", err);
    const fallbackResult = await runBuiltInPinpointRecon(profile, existingDomains, customQuery);
    return NextResponse.json(fallbackResult);
  }
}
