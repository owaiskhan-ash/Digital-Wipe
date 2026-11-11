import { NextResponse } from "next/server";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { normaliseProfile, type RawProfileInput } from "@/lib/scan";
import { BREACH_CATALOG } from "@/lib/breaches";
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

function getGeminiClient() {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
    undefined;

  return new GoogleGenAI({
    apiKey,
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
    // If hosted externally (e.g. Vercel) where internal alias gemini-3.8-flash is not found, fall back to gemini-flash-latest
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
  const customQuery = typeof payload.customQuery === "string" ? payload.customQuery.trim().slice(0, 200) : "";

  if (profile.fullName.length < 2 || profile.city.length < 2) {
    return NextResponse.json(
      { error: "Full name and city are required to deploy the AI Agent Swarm." },
      { status: 422 }
    );
  }

  const ai = getGeminiClient();
  const existingDomains = new Set(
    (payload.existingDomains ?? []).map((d) => d.toLowerCase().replace(/^www\./, ""))
  );

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

    const allGroundingSources = agentRuns.flatMap((r) =>
      r.report.sources.map((s) => `${s.title}: ${s.uri}`)
    );

    // Step 2: Fast Synthesizer Agent converts the 4 open-web agent briefings into 10-14 actionable removal targets from anywhere on the internet
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
    console.error("AI Swarm error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to run AI Reconnaissance Swarm.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function pCountry(profile: Profile): string {
  return profile.country || "United States";
}
