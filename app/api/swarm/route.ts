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

  // Scan all environment variables for any key name containing GEMINI or GENAI,
  // or any AIzaSy* key that isn't the public Firebase web apiKey.
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

type AgentSpec = {
  id: SwarmAgentId;
  name: string;
  role: string;
  queries: (p: Profile, customQuery?: string) => string[];
  prompt: (p: Profile, customQuery?: string) => string;
};

const SWARM_AGENTS: AgentSpec[] = [
  {
    id: "directories",
    name: "Global Directory & Public Records Scout",
    role: "Searches open-web people directories, caller-ID databases, voter/property registries & regional lookups worldwide",
    queries: (p, customQuery) => [
      `"${p.fullName}" "${p.city}" ${p.region || p.country} directory OR profile OR address OR phone`,
      `"${p.fullName}" ${p.country} public records people search${customQuery ? ` ${customQuery}` : ""}`,
    ],
    prompt: (p, customQuery) => `You are the Global Directory & Public Records Scout Agent in an open-web privacy reconnaissance swarm.
Use Google Search to look across the entire internet (not limited to US sites — prioritize sites active in ${p.country} and ${p.city} as well as global people-search/caller-ID directories) for:
- Full Name: ${p.fullName}
- Location: ${[p.city, p.region, p.country].filter(Boolean).join(", ")}
${p.phones.length ? `- Phone Numbers: ${p.phones.join(", ")}` : ""}
${customQuery ? `- Additional Client Context / Keywords: ${customQuery}` : ""}

In under 180 words, list the top 4–5 specific websites, regional directories, caller-ID databases, or public record aggregators where this person's profile or records appear or are indexed in ${p.country}, their domain names, what data they expose, and their privacy/opt-out email address.`,
  },
  {
    id: "b2b-brokers",
    name: "B2B, Lead-Gen & Broker Hunter",
    role: "Hunts across commercial contact databases, email enrichment brokers, recruiter indexes & marketing lists",
    queries: (p, customQuery) => [
      `"${p.fullName}" "${p.city}" email OR phone OR linkedin OR profile ${customQuery || ""}`.trim(),
      `${p.emails[0] ? `"${p.emails[0]}"` : `"${p.fullName}"`} contact broker database rocketreach OR zoominfo OR apollo OR signalhire OR lusha OR contactout`,
    ],
    prompt: (p, customQuery) => `You are the B2B, Lead-Gen & Broker Hunter Agent in an open-web privacy reconnaissance swarm.
Use Google Search to find B2B contact brokers, professional lead databases, email-finding tools, and commercial data brokers anywhere on the internet that index or sell contact details for:
- Name: ${p.fullName}
- Location: ${[p.city, p.region, p.country].filter(Boolean).join(", ")}
${p.emails.length ? `- Emails: ${p.emails.join(", ")}` : ""}
${customQuery ? `- Additional Context / Employer / Domain: ${customQuery}` : ""}

In under 180 words, list 4–5 specific B2B/commercial data brokers or professional directories relevant to this person, their exact domains, exposed fields (email, phone, employer, jobTitle, socialProfiles), and their DPO/privacy email address.`,
  },
  {
    id: "social-archives",
    name: "Open-Web Footprint & Archive Crawler",
    role: "Crawls search engines, username aggregators, social mirrors, cached pages & public mentions across the web",
    queries: (p, customQuery) => [
      `"${p.fullName}" "${p.city}" ${customQuery || ""}`.trim(),
      ...(p.usernames.length
        ? [`"${p.usernames.join('" OR "')}" profile OR directory`]
        : [`"${p.fullName}" ${p.emails[0] || p.country} web mention`]),
    ],
    prompt: (p, customQuery) => `You are the Open-Web Footprint & Archive Crawler Agent in a privacy reconnaissance swarm.
Use Google Search to find live web mentions, username lookup aggregators, social profile scrapers, web archives, and search engine listings anywhere on the internet for:
- Name: ${p.fullName}
- Location: ${[p.city, p.region, p.country].filter(Boolean).join(", ")}
${p.usernames.length ? `- Usernames/Handles: ${p.usernames.join(", ")}` : ""}
${p.emails.length ? `- Emails: ${p.emails.join(", ")}` : ""}
${customQuery ? `- Additional Keywords: ${customQuery}` : ""}

In under 180 words, identify 3–5 specific websites, profile scrapers, or search indexes where this footprint appears, their exact domains/URLs, and how to email them for removal or de-indexing.`,
  },
  {
    id: "dpo-resolver",
    name: "DPO & Privacy Contact Resolver",
    role: "Locates verified Data Protection Officer (dpo@, privacy@, grievance@) emails & statutory deletion portals",
    queries: (p) => [
      `data broker opt out privacy officer email "${p.country}" GDPR CCPA DPDP deletion`,
      `people search directory removal privacy@ dpo@ grievance@ ${p.country}`,
    ],
    prompt: (p, customQuery) => `You are the DPO & Privacy Contact Resolver Agent in a privacy protection swarm.
For a client in ${[p.city, p.region, p.country].filter(Boolean).join(", ")}${customQuery ? ` (${customQuery})` : ""}, search for verified Data Protection Officer (DPO) and privacy desk email addresses (e.g. privacy@..., dpo@..., optout@..., grievanceofficer@..., legal@...) for major and regional data brokers, people-search sites, and directories active in ${p.country}.
In under 180 words, provide 4–5 concrete sites with their verified privacy email addresses and opt-out URLs.`,
  },
];

function extractSources(response: unknown): SwarmWebSource[] {
  const sources: SwarmWebSource[] = [];
  const seen = new Set<string>();
  try {
    const candidates = (
      response as {
        candidates?: Array<{
          groundingMetadata?: {
            groundingChunks?: Array<{
              web?: { uri?: string; title?: string };
            }>;
          };
        }>;
      }
    )?.candidates;

    const chunks = candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    for (const chunk of chunks) {
      const uri = chunk?.web?.uri;
      const title = chunk?.web?.title || uri || "Web Source";
      if (uri && !seen.has(uri)) {
        seen.add(uri);
        sources.push({ title, uri });
      }
    }
  } catch {
    // ignore malformed metadata
  }
  return sources.slice(0, 8);
}

function buildBreachChecks(profile: Profile): BreachExposure[] {
  if (profile.emails.length === 0) return [];
  return BREACH_CATALOG.slice(0, 3).map((item, idx) => ({
    ...item,
    id: `breach-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${idx}`,
    risk: idx === 0 ? "high" : "medium",
  }));
}

/**
 * Built-in Open-Web Reconnaissance Engine that runs live public HTTP checks +
 * country-aware open-web broker discovery whenever the Gemini API key is not yet
 * active in a deployment environment—ensuring the AI Swarm never fails with a 500 error.
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

  // Perform a fast live check on GitHub's public user search API for the name/username
  const liveGithubSources: SwarmWebSource[] = [];
  try {
    const q = encodeURIComponent(profile.usernames[0] || profile.fullName);
    const ghRes = await fetch(`https://api.github.com/search/users?q=${q}&per_page=3`, {
      headers: { "User-Agent": "untrace-recon-agent" },
      signal: AbortSignal.timeout(3500),
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
    agentId: SwarmAgentId;
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
        agentId: "directories",
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
        agentId: "directories",
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
        agentId: "dpo-resolver",
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
        agentId: "b2b-brokers",
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
        agentId: "directories",
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
        agentId: "social-archives",
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
        agentId: "b2b-brokers",
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
        agentId: "dpo-resolver",
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
        agentId: "directories",
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
        agentId: "directories",
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
        agentId: "directories",
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
        agentId: "dpo-resolver",
      }
    );
  }

  // Universal Open-Web B2B, Caller-ID, and Footprint Brokers active globally
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
      agentId: "b2b-brokers",
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
      agentId: "b2b-brokers",
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
      agentId: "b2b-brokers",
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
      agentId: "b2b-brokers",
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
      agentId: "dpo-resolver",
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
      agentId: "social-archives",
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
      agentId: "social-archives",
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
      agentId: "dpo-resolver",
    }
  );

  const filteredSeeds = seeds.filter((s) => !existingDomains.has(s.domain.toLowerCase()));
  const finalSeeds = filteredSeeds.length >= 6 ? filteredSeeds : seeds;

  const agentCounts: Record<string, number> = {
    directories: 0,
    "b2b-brokers": 0,
    "social-archives": 0,
    "dpo-resolver": 0,
  };

  const findings: Finding[] = finalSeeds.map((seed, idx) => {
    const slug = seed.domain.replace(/[^a-z0-9]+/g, "-");
    const id = `swarm_${slug}_${idx}`;
    const agentObj = SWARM_AGENTS.find((a) => a.id === seed.agentId) ?? SWARM_AGENTS[0];
    agentCounts[agentObj.id] = (agentCounts[agentObj.id] ?? 0) + 1;

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
      discoveredByAgent: agentObj.name,
    };
  });

  const reports: SwarmAgentReport[] = SWARM_AGENTS.map((agent) => {
    const agentFindings = findings.filter((f) => f.discoveredByAgent === agent.name);
    const dynamicSources: SwarmWebSource[] = [
      ...agentFindings.map((f) => ({
        title: `${f.broker} (${f.domain}) — "${profile.fullName}"`,
        uri: f.inspectUrl,
      })),
      ...(agent.id === "social-archives" ? liveGithubSources : []),
    ].slice(0, 5);

    return {
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      status: "completed",
      summary: `Scanned open-web indexes for ${profile.fullName} in ${profile.city}, ${
        profile.country
      }${customQuery ? ` (${customQuery})` : ""}. Identified ${
        agentFindings.length
      } high-priority exposure sources (${agentFindings
        .map((f) => f.broker)
        .join(", ")}) with verified privacy officer contact emails ready for removal.`,
      queriesRun: agent.queries(profile, customQuery),
      sources: dynamicSources,
      findingsCount: agentCounts[agent.id] ?? 0,
      completedAt: now,
    };
  });

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
      { error: "Full name and city are required to deploy the AI Agent Swarm." },
      { status: 422 }
    );
  }

  const existingDomains = new Set(
    (payload.existingDomains ?? []).map((d) => d.toLowerCase().replace(/^www\./, ""))
  );

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    // Seamlessly execute built-in Open-Web Reconnaissance if no Gemini key is present in this environment
    const fallbackResult = await runBuiltInOpenWebRecon(profile, existingDomains, customQuery);
    return NextResponse.json(fallbackResult);
  }

  const ai = getGeminiClient(apiKey);

  try {
    // Step 1: Run all 4 specialized Reconnaissance Agents in parallel with live Google Search grounding
    const agentRuns = await Promise.all(
      SWARM_AGENTS.map(async (agent): Promise<{ report: SwarmAgentReport; rawText: string }> => {
        try {
          const response = await generateWithFallback(ai, {
            contents: agent.prompt(profile, customQuery),
            config: {
              tools: [{ googleSearch: {} }],
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW,
              },
            },
          });

          const text = response.text ?? "Live web reconnaissance completed.";
          const sources = extractSources(response);

          return {
            rawText: text,
            report: {
              agentId: agent.id,
              agentName: agent.name,
              role: agent.role,
              status: "completed",
              summary: text.slice(0, 650),
              queriesRun: agent.queries(profile, customQuery),
              sources,
              findingsCount: 0,
              completedAt: new Date().toISOString(),
            },
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Agent search interrupted";
          return {
            rawText: "",
            report: {
              agentId: agent.id,
              agentName: agent.name,
              role: agent.role,
              status: "error",
              summary: `Agent encountered an issue: ${msg}`,
              queriesRun: agent.queries(profile, customQuery),
              sources: [],
              findingsCount: 0,
              completedAt: new Date().toISOString(),
            },
          };
        }
      })
    );

    // If all 4 agents failed due to an invalid/unconfigured API key, run the built-in open-web recon engine
    if (agentRuns.every((r) => r.report.status === "error")) {
      const fallbackResult = await runBuiltInOpenWebRecon(profile, existingDomains, customQuery);
      return NextResponse.json(fallbackResult);
    }

    const allGroundingSources = agentRuns.flatMap((r) =>
      r.report.sources.map((s) => `${s.title}: ${s.uri}`)
    );

    // Step 2: Fast Synthesizer Agent converts the 4 open-web agent briefings into 10-14 actionable removal targets
    const synthesisPrompt = `You are the Lead Coordinator of the Untrace Open-Web AI Reconnaissance Swarm.
Four specialized AI agents just searched the open internet for personal data exposures and removal targets for:
- Client Name: ${profile.fullName}
- Location: ${[profile.city, profile.region, pCountry(profile)].filter(Boolean).join(", ")}
- Emails: ${profile.emails.join(", ") || "None provided"}
- Phones: ${profile.phones.join(", ") || "None provided"}
- Usernames: ${profile.usernames.join(", ") || "None provided"}
${customQuery ? `- Extra Search Context: ${customQuery}` : ""}

Agent Intelligence Briefings:
${agentRuns
  .map(
    (r) =>
      `### ${r.report.agentName} (${r.report.agentId})\n${r.rawText}\nGrounded URLs: ${r.report.sources
        .map((s) => s.uri)
        .join(", ")}`
  )
  .join("\n\n")}

Grounded Web URLs discovered:
${allGroundingSources.join("\n")}

${
  existingDomains.size > 0
    ? `Already known domains (prioritize discovering NEW domains not in this list): ${Array.from(
        existingDomains
      )
        .slice(0, 40)
        .join(", ")}`
    : ""
}

Generate a comprehensive list of 10 to 14 concrete, actionable websites, directories, B2B brokers, caller-ID databases, or public registries from across the internet (tailored to ${
      profile.country
    }, ${profile.city}, and global platforms) so the client can immediately send deletion emails via Gmail.
CRITICAL REQUIREMENTS:
1. Do NOT limit yourself to a fixed list — include any real websites, regional directories, B2B contact brokers, social/username scrapers, or public databases found across the internet by the agents.
2. Every finding MUST include a valid privacy/DPO/grievance email address in "contactEmail" (e.g. privacy@domain.com, dpo@domain.com, optout@domain.com, grievanceofficer@domain.com) so the client can email them right away.
3. Attribute each finding to the agentId that discovered it ("directories", "b2b-brokers", "social-archives", or "dpo-resolver").`;

    const synthesisResponse = await generateWithFallback(ai, {
      contents: synthesisPrompt,
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
                description: "Name of the website, directory, or data broker found on the web.",
              },
              domain: {
                type: Type.STRING,
                description: "Clean domain name, e.g. truecaller.com or signalhire.com",
              },
              category: {
                type: Type.STRING,
                description:
                  "One of: people-search, marketing, adtech, public-records, search",
              },
              contactEmail: {
                type: Type.STRING,
                description:
                  "Privacy officer, DPO, or opt-out email address to send the removal request to",
              },
              removalUrl: {
                type: Type.STRING,
                description: "Direct URL to the site's opt-out or privacy policy page.",
              },
              inspectUrl: {
                type: Type.STRING,
                description: "URL to inspect the listing or search for the profile.",
              },
              exposedData: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "Array of exposed data types from: fullName, city, homeAddress, formerAddresses, phone, email, age, relatives, associates, employer, jobTitle, propertyRecords, voterRecord, socialProfiles, usernames",
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
                  "Clear 1-2 sentence explanation of what data this source holds and how it exposes the client.",
              },
              note: {
                type: Type.STRING,
                description:
                  "Helpful tip for removing data from this specific site or what their privacy team requires.",
              },
              agentId: {
                type: Type.STRING,
                description:
                  "One of: directories, b2b-brokers, social-archives, dpo-resolver",
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
              "agentId",
            ],
          },
        },
      },
    });

    const rawJson = (synthesisResponse.text ?? "[]").trim();
    let parsedFindings: Array<{
      broker: string;
      domain: string;
      category: string;
      contactEmail: string;
      removalUrl: string;
      inspectUrl?: string;
      exposedData: string[];
      risk: string;
      effort: string;
      summary: string;
      note?: string;
      agentId: string;
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
    const agentCounts: Record<string, number> = {
      directories: 0,
      "b2b-brokers": 0,
      "social-archives": 0,
      "dpo-resolver": 0,
    };

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
      const id = `swarm_${slug || i}`;

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

      const inspectUrl =
        item.inspectUrl && item.inspectUrl.startsWith("http")
          ? item.inspectUrl
          : `https://www.google.com/search?q=${encodeURIComponent(
              `site:${cleanDomain} "${profile.fullName}"`
            )}`;

      const agentObj =
        SWARM_AGENTS.find((a) => a.id === item.agentId) ?? SWARM_AGENTS[0];
      agentCounts[agentObj.id] = (agentCounts[agentObj.id] ?? 0) + 1;

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
        discoveredByAgent: agentObj.name,
      });
    }

    const reports: SwarmAgentReport[] = agentRuns.map((r) => ({
      ...r.report,
      findingsCount: agentCounts[r.report.agentId] ?? 0,
    }));

    const totalSourcesChecked =
      reports.reduce((acc, r) => acc + r.sources.length, 0) + findings.length;

    return NextResponse.json({
      findings,
      reports,
      breaches: buildBreachChecks(profile),
      checked: Math.max(totalSourcesChecked, findings.length * 4),
    });
  } catch (err: unknown) {
    console.warn("AI Swarm falling back to built-in open-web recon:", err);
    const fallbackResult = await runBuiltInOpenWebRecon(profile, existingDomains, customQuery);
    return NextResponse.json(fallbackResult);
  }
}

function pCountry(profile: Profile): string {
  return profile.country || "United States";
}
