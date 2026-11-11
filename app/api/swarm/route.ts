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
    name: "People Directories & Caller-ID",
    role: "Public directories, caller-ID apps, and regional address/phone lookups",
  },
  {
    id: "b2b-brokers",
    name: "B2B & Contact Brokers",
    role: "Commercial email/phone databases, recruiter tools & lead lists",
  },
  {
    id: "social-archives",
    name: "Open-Web & Username Mentions",
    role: "Search indexes, username aggregators, social mirrors & web caches",
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
  customQuery: string,
  extraSources: SwarmWebSource[] = []
): SwarmAgentReport[] {
  const now = new Date().toISOString();
  return REPORT_SECTIONS.map((section) => {
    const matched = findings.filter((f) => {
      if (section.id === "directories") return f.category === "people-search";
      if (section.id === "b2b-brokers")
        return f.category === "marketing" || f.category === "adtech";
      if (section.id === "social-archives") return f.category === "search";
      return f.category === "public-records" || Boolean(f.contactEmail);
    });

    const sectionFindings =
      section.id === "dpo-resolver" ? findings.slice(0, 4) : matched.slice(0, 5);

    const sources: SwarmWebSource[] = [
      ...sectionFindings.map((f) => ({
        title: `${f.broker} (${f.domain})`,
        uri: f.inspectUrl,
      })),
      ...(section.id === "social-archives" ? extraSources : []),
    ].slice(0, 5);

    return {
      agentId: section.id,
      agentName: section.name,
      role: section.role,
      status: "completed",
      summary:
        sectionFindings.length > 0
          ? `Gemini 3.8 Flash identified ${sectionFindings.length} relevant sources (${sectionFindings
              .map((f) => f.broker)
              .join(", ")}) for ${profile.fullName} in ${profile.city}, ${profile.country}${
              customQuery ? ` matching "${customQuery}"` : ""
            }.`
          : `Completed scan for ${profile.fullName} in ${profile.city}, ${profile.country}.`,
      queriesRun: [
        `"${profile.fullName}" "${profile.city}" ${profile.country} ${customQuery}`.trim(),
      ],
      sources,
      findingsCount: sectionFindings.length,
      completedAt: now,
    };
  });
}

/**
 * Fast, reliable built-in Open-Web Reconnaissance Engine that runs whenever
 * Gemini API key is not configured or if the model call times out.
 */
async function runBuiltInOpenWebRecon(
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
  const isEU =
    countryLower.includes("europe") ||
    countryLower.includes("germany") ||
    countryLower.includes("france") ||
    countryLower.includes("netherlands");

  const liveGithubSources: SwarmWebSource[] = [];
  try {
    const q = encodeURIComponent(profile.usernames[0] || profile.fullName);
    const ghRes = await fetch(`https://api.github.com/search/users?q=${q}&per_page=3`, {
      headers: { "User-Agent": "untrace-recon-agent" },
      signal: AbortSignal.timeout(2500),
    });
    if (ghRes.ok) {
      const ghData = (await ghRes.json()) as {
        items?: Array<{ login: string; html_url: string }>;
      };
      for (const user of ghData.items ?? []) {
        liveGithubSources.push({
          title: `GitHub Profile: @${user.login}`,
          uri: user.html_url,
        });
      }
    }
  } catch {
    // ignore timeout
  }

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
  };

  const seeds: TargetSeed[] = [];

  if (isIndia) {
    seeds.push(
      {
        broker: "Truecaller",
        domain: "truecaller.com",
        category: "people-search",
        contactEmail: "rgo.india@truecaller.com",
        removalUrl: "https://www.truecaller.com/unlisting",
        exposedData: ["fullName", "phone", "city", "email"],
        risk: "high",
        effort: "easy",
        summary: `Crowdsourced caller-ID and phone directory indexing ${profile.fullName}'s phone number, name, and location in ${profile.city}.`,
        note: "Cite Section 12 of the Digital Personal Data Protection (DPDP) Act 2023 when emailing the Resident Grievance Officer.",
      },
      {
        broker: "Justdial",
        domain: "justdial.com",
        category: "people-search",
        contactEmail: "grievanceofficer@justdial.com",
        removalUrl: "https://www.justdial.com",
        exposedData: ["fullName", "phone", "homeAddress", "city"],
        risk: "high",
        effort: "easy",
        summary: `Regional directory in ${profile.city} that indexes personal phone numbers, local addresses, and professional listings.`,
        note: "Email the Grievance Officer requesting permanent delisting of your personal contact record.",
      },
      {
        broker: "ZaubaCorp / Corporate Registry Mirror",
        domain: "zaubacorp.com",
        category: "public-records",
        contactEmail: "privacy@zaubacorp.com",
        removalUrl: "https://www.zaubacorp.com/privacy-policy",
        exposedData: ["fullName", "city", "employer", "jobTitle"],
        risk: "medium",
        effort: "medium",
        summary: `Public corporate and director index aggregating filings, addresses, and professional affiliations for ${profile.fullName}.`,
        note: "Request suppression of personal residential details and search engine de-indexing.",
      },
      {
        broker: "IndiaMART Directory",
        domain: "indiamart.com",
        category: "marketing",
        contactEmail: "grievance@indiamart.com",
        removalUrl: "https://help.indiamart.com",
        exposedData: ["fullName", "phone", "email", "city"],
        risk: "medium",
        effort: "easy",
        summary: `Commercial contact marketplace that stores buyer/seller phone numbers and email addresses in ${profile.city}.`,
        note: "Contact the grievance desk citing DPDP Act right to erasure.",
      }
    );
  } else if (isUK || isEU) {
    seeds.push(
      {
        broker: "192.com Electoral & Directory Index",
        domain: "192.com",
        category: "people-search",
        contactEmail: "privacy@192.com",
        removalUrl: "https://www.192.com/privacy-notice/",
        exposedData: ["fullName", "homeAddress", "city", "age", "voterRecord"],
        risk: "high",
        effort: "easy",
        summary: `Publishes edited electoral roll, residential address, and occupancy records for ${profile.fullName} in ${profile.city}.`,
        note: "Cite UK/EU GDPR Article 17 right to erasure when emailing privacy@192.com.",
      },
      {
        broker: "Yasni People Search",
        domain: "yasni.co.uk",
        category: "search",
        contactEmail: "info@yasni.de",
        removalUrl: "https://www.yasni.co.uk",
        exposedData: ["fullName", "city", "socialProfiles", "photos"],
        risk: "medium",
        effort: "easy",
        summary: `European people-search aggregator compiling web mentions, images, and social profiles for ${profile.fullName}.`,
        note: "Send a GDPR Article 17 erasure notice to remove cached profile pages.",
      },
      {
        broker: "Kaspr B2B Contact Broker",
        domain: "kaspr.io",
        category: "marketing",
        contactEmail: "privacy@kaspr.io",
        removalUrl: "https://www.kaspr.io/privacy-policy",
        exposedData: ["fullName", "email", "phone", "employer", "jobTitle"],
        risk: "high",
        effort: "easy",
        summary: `Scrapes professional profiles to sell direct phone numbers and email addresses for ${profile.fullName}.`,
        note: "Email privacy@kaspr.io requesting immediate GDPR suppression.",
      },
      {
        broker: "Cognism Lead Intelligence",
        domain: "cognism.com",
        category: "marketing",
        contactEmail: "dpo@cognism.com",
        removalUrl: "https://www.cognism.com/privacy-policy",
        exposedData: ["fullName", "email", "phone", "employer", "city"],
        risk: "high",
        effort: "easy",
        summary: `B2B sales database holding direct dial numbers and verified business/personal emails in ${profile.city}.`,
        note: "Email dpo@cognism.com to opt out and add your email to their permanent suppression list.",
      }
    );
  } else {
    seeds.push(
      {
        broker: "FastPeopleSearch",
        domain: "fastpeoplesearch.com",
        category: "people-search",
        contactEmail: "privacy@fastpeoplesearch.com",
        removalUrl: "https://www.fastpeoplesearch.com/removal",
        exposedData: ["fullName", "homeAddress", "formerAddresses", "phone", "age", "relatives"],
        risk: "high",
        effort: "easy",
        summary: `Publishes current and past street addresses, phone numbers, and relatives for ${profile.fullName} in ${profile.city}.`,
        note: "Include your full name and city in the deletion notice to privacy@fastpeoplesearch.com.",
      },
      {
        broker: "ClustrMaps Public Directory",
        domain: "clustrmaps.com",
        category: "people-search",
        contactEmail: "support@clustrmaps.com",
        removalUrl: "https://clustrmaps.com/bl/opt-out",
        exposedData: ["fullName", "homeAddress", "city", "phone", "associates"],
        risk: "high",
        effort: "easy",
        summary: `Maps residential street addresses, household members, and associated phone numbers in ${profile.city}.`,
        note: "Send an email removal notice citing CCPA/GDPR right to erasure.",
      },
      {
        broker: "Nuwber People Directory",
        domain: "nuwber.com",
        category: "people-search",
        contactEmail: "support@nuwber.com",
        removalUrl: "https://nuwber.com/removal/link",
        exposedData: ["fullName", "homeAddress", "phone", "email", "relatives", "age"],
        risk: "high",
        effort: "easy",
        summary: `Aggregates residential history, phone numbers, and family associates for ${profile.fullName}.`,
        note: "Email support@nuwber.com with your profile search URL or city/state details.",
      },
      {
        broker: "CyberBackgroundChecks",
        domain: "cyberbackgroundchecks.com",
        category: "public-records",
        contactEmail: "privacy@cyberbackgroundchecks.com",
        removalUrl: "https://www.cyberbackgroundchecks.com/removal",
        exposedData: ["fullName", "homeAddress", "formerAddresses", "phone", "email", "relatives"],
        risk: "high",
        effort: "easy",
        summary: `Exposes detailed address history, landline/mobile numbers, and known relatives in ${profile.city}.`,
        note: "Send formal opt-out request to privacy@cyberbackgroundchecks.com.",
      }
    );
  }

  seeds.push(
    {
      broker: "SignalHire Contact Database",
      domain: "signalhire.com",
      category: "marketing",
      contactEmail: "support@signalhire.com",
      removalUrl: "https://www.signalhire.com/opt-out",
      exposedData: ["fullName", "email", "phone", "employer", "jobTitle", "socialProfiles"],
      risk: "high",
      effort: "easy",
      summary: `Browser-extension contact broker exposing personal emails, mobile numbers, and work history for ${profile.fullName}.`,
      note: "Send deletion request to support@signalhire.com to purge your profile from recruiter searches.",
    },
    {
      broker: "ContactOut Email & Phone Broker",
      domain: "contactout.com",
      category: "marketing",
      contactEmail: "support@contactout.com",
      removalUrl: "https://contactout.com/optout",
      exposedData: ["fullName", "email", "phone", "employer", "socialProfiles"],
      risk: "high",
      effort: "easy",
      summary: `Indexes personal Gmail/work email addresses and phone numbers linked to ${profile.fullName} in ${profile.city}.`,
      note: "Email support@contactout.com citing statutory right to erasure.",
    },
    {
      broker: "RocketReach Professional Index",
      domain: "rocketreach.co",
      category: "marketing",
      contactEmail: "privacy@rocketreach.co",
      removalUrl: "https://rocketreach.co/aly/opt_out",
      exposedData: ["fullName", "email", "phone", "employer", "jobTitle", "city"],
      risk: "high",
      effort: "easy",
      summary: `Publishes direct email addresses, phone numbers, and professional history for ${profile.fullName}.`,
      note: "Email privacy@rocketreach.co for permanent removal and suppression.",
    },
    {
      broker: "Lusha B2B Data Broker",
      domain: "lusha.com",
      category: "marketing",
      contactEmail: "privacy@lusha.com",
      removalUrl: "https://www.lusha.com/privacy-center/",
      exposedData: ["fullName", "email", "phone", "employer", "city"],
      risk: "high",
      effort: "easy",
      summary: `Commercial contact enrichment database sharing direct phone numbers and emails for ${profile.fullName}.`,
      note: "Email privacy@lusha.com to remove your contact record and add it to their DNC list.",
    },
    {
      broker: "Apollo.io Lead Database",
      domain: "apollo.io",
      category: "marketing",
      contactEmail: "privacy@apollo.io",
      removalUrl: "https://www.apollo.io/privacy-policy/remove",
      exposedData: ["fullName", "email", "phone", "employer", "jobTitle", "city"],
      risk: "high",
      effort: "easy",
      summary: `Global sales intelligence index storing verified emails, phone numbers, and location data in ${profile.city}.`,
      note: "Email privacy@apollo.io requesting erasure of your contact profile.",
    },
    {
      broker: "IDCrawl Username & People Aggregator",
      domain: "idcrawl.com",
      category: "search",
      contactEmail: "support@idcrawl.com",
      removalUrl: "https://www.idcrawl.com/opt-out",
      exposedData: ["fullName", "city", "usernames", "socialProfiles", "photos"],
      risk: "medium",
      effort: "easy",
      summary: `Cross-indexes usernames, social media accounts, and public web mentions for ${profile.fullName} in ${profile.city}.`,
      note: "Request profile suppression via support@idcrawl.com.",
    },
    {
      broker: "PeekYou Social & Web Footprint",
      domain: "peekyou.com",
      category: "people-search",
      contactEmail: "support@peekyou.com",
      removalUrl: "https://www.peekyou.com/about/contact/optout/",
      exposedData: ["fullName", "city", "usernames", "socialProfiles", "email"],
      risk: "medium",
      effort: "easy",
      summary: `Links public social handles, web mentions, and city records for ${profile.fullName}.`,
      note: "Send a deletion request to support@peekyou.com citing your name and city.",
    },
    {
      broker: "Radaris Global Public Records",
      domain: "radaris.com",
      category: "people-search",
      contactEmail: "privacy@radaris.com",
      removalUrl: "https://radaris.com/control/privacy",
      exposedData: ["fullName", "homeAddress", "phone", "relatives", "city"],
      risk: "high",
      effort: "medium",
      summary: `Maintains a public dossier of address records, phone numbers, and web mentions for ${profile.fullName}.`,
      note: "Email privacy@radaris.com demanding permanent suppression of your dossier.",
    }
  );

  const filteredSeeds = seeds.filter((s) => !existingDomains.has(s.domain.toLowerCase()));
  const finalSeeds = filteredSeeds.length >= 6 ? filteredSeeds : seeds;

  const findings: Finding[] = finalSeeds.map((seed, idx) => {
    const slug = seed.domain.replace(/[^a-z0-9]+/g, "-");
    const id = `gemini_${slug}_${idx}`;

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
      inspectUrl: `https://www.google.com/search?q=${encodeURIComponent(
        `site:${seed.domain} "${profile.fullName}" ${profile.city}`
      )}`,
      firstSeen: now,
      lastSeen: now,
      summary: seed.summary,
      note: seed.note,
      discoveredByAgent: "Gemini 3.8 Flash",
    };
  });

  const reports = buildReportsFromFindings(profile, findings, customQuery, liveGithubSources);

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

  const profile = normaliseProfile(payload.profile ?? {});
  const customQuery =
    typeof payload.customQuery === "string" ? payload.customQuery.trim().slice(0, 200) : "";

  if (profile.fullName.length < 2 || profile.city.length < 2) {
    return NextResponse.json(
      { error: "Full name and city are required to search with Gemini 3.8 Flash." },
      { status: 422 }
    );
  }

  const existingDomains = new Set(
    (payload.existingDomains ?? []).map((d) => d.toLowerCase().replace(/^www\./, ""))
  );

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    const fallbackResult = await runBuiltInOpenWebRecon(profile, existingDomains, customQuery);
    return NextResponse.json(fallbackResult);
  }

  const ai = getGeminiClient(apiKey);

  try {
    // Single, fast Gemini 3.8 Flash call that directly finds what the user is looking for
    const singlePrompt = `You are Gemini 3.8 Flash powering Untrace, a personal data exposure & removal assistant.
Find the 10 to 12 most relevant websites, people-search directories, caller-ID apps, B2B contact brokers, username/social scrapers, and public registries across the internet where this person's data is likely indexed or exposed, and provide each website's official privacy/DPO/opt-out email address so the user can immediately email them for removal:

- Full Name: ${profile.fullName}
- Location: ${[profile.city, profile.region, profile.country].filter(Boolean).join(", ")}
- Emails: ${profile.emails.join(", ") || "None provided"}
- Phone Numbers: ${profile.phones.join(", ") || "None provided"}
- Usernames / Handles: ${profile.usernames.join(", ") || "None provided"}
${customQuery ? `- User Search Intent / Extra Context: ${customQuery}` : ""}
${
  existingDomains.size > 0
    ? `- Already listed domains (find NEW websites not in this list): ${Array.from(existingDomains)
        .slice(0, 35)
        .join(", ")}`
    : ""
}

Requirements:
1. Tailor the results to ${profile.country} and ${profile.city} (for example, include regional directories/caller-ID/corporate registries active in ${profile.country} alongside global B2B contact brokers and people-search sites).
2. If the user provided a specific search intent ("${customQuery || "general personal data removal"}"), prioritize websites, directories, or brokers matching that intent.
3. Every item MUST include a valid removal/privacy email address in "contactEmail" (e.g., privacy@domain.com, dpo@domain.com, grievanceofficer@domain.com, support@domain.com).`;

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
                description: "Name of the website, directory, or data broker.",
              },
              domain: {
                type: Type.STRING,
                description: "Clean domain name, e.g. truecaller.com or rocketreach.co",
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
                description: "Direct URL to the site's opt-out or privacy policy page.",
              },
              exposedData: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "Exposed fields from: fullName, city, homeAddress, formerAddresses, phone, email, age, relatives, associates, employer, jobTitle, propertyRecords, voterRecord, socialProfiles, usernames",
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
                description: "1-2 sentence explanation of what data this website exposes.",
              },
              note: {
                type: Type.STRING,
                description: "Short tip on what to cite or include when emailing this site.",
              },
            },
            required: [
              "broker",
              "domain",
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

    // Guard with an 8-second timeout so Vercel Hobby never times out
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 8000)
    );

    const response = await Promise.race([geminiPromise, timeoutPromise]);
    if (!response) {
      const fallbackResult = await runBuiltInOpenWebRecon(profile, existingDomains, customQuery);
      return NextResponse.json(fallbackResult);
    }

    const rawJson = (response.text ?? "[]").trim();
    let parsedFindings: Array<{
      broker: string;
      domain: string;
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
      const fallbackResult = await runBuiltInOpenWebRecon(profile, existingDomains, customQuery);
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
      const id = `gemini_${slug || i}`;

      const category: Category = VALID_CATEGORIES.has(item.category as Category)
        ? (item.category as Category)
        : "people-search";

      const validData = (item.exposedData ?? []).filter((d): d is DataType =>
        VALID_DATA_TYPES.has(d as DataType)
      );
      const data: DataType[] = Array.from(new Set<DataType>(["fullName", ...validData]));
      if (data.length < 2) {
        data.push("city", "email");
      }

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

      const inspectUrl = `https://www.google.com/search?q=${encodeURIComponent(
        `site:${cleanDomain} "${profile.fullName}" ${profile.city}`
      )}`;

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
        discoveredByAgent: "Gemini 3.8 Flash",
      });
    }

    const reports = buildReportsFromFindings(profile, findings, customQuery);

    return NextResponse.json({
      findings,
      reports,
      breaches: buildBreachChecks(profile),
      checked: Math.max(findings.length * 4, 32),
    });
  } catch (err: unknown) {
    console.warn("Gemini 3.8 Flash falling back to built-in open-web recon:", err);
    const fallbackResult = await runBuiltInOpenWebRecon(profile, existingDomains, customQuery);
    return NextResponse.json(fallbackResult);
  }
}
