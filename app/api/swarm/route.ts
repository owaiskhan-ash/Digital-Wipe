import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { normaliseProfile, type RawProfileInput } from "@/lib/scan";
import type {
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
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
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
  queries: (p: Profile) => string[];
  prompt: (p: Profile) => string;
};

const SWARM_AGENTS: AgentSpec[] = [
  {
    id: "directories",
    name: "Directory & People-Search Recon",
    role: "Scans residential directories, whitepages, property & voter aggregators",
    queries: (p) => [
      `"${p.fullName}" "${p.city}" address phone profile`,
      `"${p.fullName}" ${p.region || p.country} public records directory`,
    ],
    prompt: (p) => `You are the Directory & People-Search Recon Agent in a privacy protection swarm.
Search the web for public people-search directories, whitepages, address aggregators, and public record brokers that list or index profiles for:
- Name: ${p.fullName}
- City/Region: ${[p.city, p.region, p.country].filter(Boolean).join(", ")}
${p.phones.length ? `- Phone: ${p.phones.join(", ")}` : ""}

Identify every specific website, people-search directory, or regional public record aggregator where this person's name/location appears or is indexed, what personal fields are exposed (address, phone, relatives, age, property/voter records), and the site's domain and opt-out or privacy contact email. Provide a concise intelligence briefing.`,
  },
  {
    id: "b2b-brokers",
    name: "B2B & Marketing Broker Hunter",
    role: "Tracks commercial lead databases, B2B contact brokers & email lists",
    queries: (p) => [
      `"${p.fullName}" ${p.city} email profile rocketreach OR zoominfo OR apollo OR signalhire OR contactout`,
      `${p.emails[0] ? `"${p.emails[0]}"` : `"${p.fullName}"`} work contact broker database`,
    ],
    prompt: (p) => `You are the B2B & Marketing Broker Hunter Agent in a privacy protection swarm.
Search the web for B2B lead databases, professional contact brokers (e.g., RocketReach, SignalHire, ContactOut, ClustrMaps, Lusha, Apollo, ZoomInfo, Radaris, Nuwber, etc.), and marketing lists that hold or expose data for:
- Name: ${p.fullName}
- Location: ${[p.city, p.region, p.country].filter(Boolean).join(", ")}
${p.emails.length ? `- Emails: ${p.emails.join(", ")}` : ""}

List the specific B2B brokers and marketing directories found, their domains, what professional/contact fields they expose (email, phone, employer, job title, social profiles), and their privacy/opt-out email address.`,
  },
  {
    id: "social-archives",
    name: "Footprint & Web Archive Crawler",
    role: "Searches usernames, cached pages, search indexes & public mentions",
    queries: (p) => [
      `"${p.fullName}" "${p.city}"`,
      ...(p.usernames.length ? [`"${p.usernames[0]}" profile`] : []),
    ],
    prompt: (p) => `You are the Footprint & Web Archive Crawler Agent in a privacy protection swarm.
Search the web for public mentions, username profiles, web archives, scraping mirrors, and search engine results exposing personal details for:
- Name: ${p.fullName}
- Location: ${[p.city, p.region, p.country].filter(Boolean).join(", ")}
${p.usernames.length ? `- Usernames/Handles: ${p.usernames.join(", ")}` : ""}
${p.emails.length ? `- Emails: ${p.emails.join(", ")}` : ""}

Summarize any live web pages, profile aggregators, or directories found, their exact domains/URLs, and how the user can request removal or de-indexing.`,
  },
  {
    id: "dpo-resolver",
    name: "Privacy Desk & DPO Resolver",
    role: "Finds verified privacy officer emails & statutory opt-out endpoints",
    queries: (p) => [
      `data broker opt out privacy email address "${p.country}" GDPR CCPA deletion`,
      `people search removal privacy@ dpo@ optout@ contact list`,
    ],
    prompt: (p) => `You are the Privacy Desk & DPO Resolver Agent in a privacy protection swarm.
For a client located in ${[p.city, p.region, p.country].filter(Boolean).join(", ")}, search for active data brokers, people-search sites, and regional directories operating in ${p.country} that accept email deletion requests (GDPR / CCPA / national privacy laws).
Provide a list of high-priority data brokers and directories with their verified privacy officer email addresses (e.g., privacy@..., dpo@..., optout@..., compliance@...) and official opt-out URLs so our system can queue direct removal emails for the client.`,
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

export async function POST(request: Request) {
  let payload: { profile?: RawProfileInput; existingDomains?: string[] };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const profile = normaliseProfile(payload.profile ?? {});
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
    // Step 1: Run all 4 specialized Reconnaissance Agents in parallel with Google Search grounding
    const agentRuns = await Promise.all(
      SWARM_AGENTS.map(async (agent): Promise<{ report: SwarmAgentReport; rawText: string }> => {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: agent.prompt(profile),
            config: {
              tools: [{ googleSearch: {} }],
            },
          });

          const text = response.text ?? "Reconnaissance scan completed.";
          const sources = extractSources(response);

          return {
            rawText: text,
            report: {
              agentId: agent.id,
              agentName: agent.name,
              role: agent.role,
              status: "completed",
              summary: text.slice(0, 600),
              queriesRun: agent.queries(profile),
              sources,
              findingsCount: 0, // updated after synthesis
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
              queriesRun: agent.queries(profile),
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

    // Step 2: Run the Swarm Synthesizer Agent to convert the 4 agent reports into actionable Findings with removal emails
    const synthesisPrompt = `You are the Lead Coordinator of the Untrace AI Reconnaissance Swarm.
Four specialized AI agents just searched the internet for personal data exposures and removal targets for:
- Client Name: ${profile.fullName}
- Location: ${[profile.city, profile.region, profile.country].filter(Boolean).join(", ")}
- Emails: ${profile.emails.join(", ") || "None provided"}
- Phones: ${profile.phones.join(", ") || "None provided"}
- Usernames: ${profile.usernames.join(", ") || "None provided"}

Here are the intelligence reports from the 4 agents:
${agentRuns
  .map(
    (r) =>
      `### Agent: ${r.report.agentName} (${r.report.agentId})\n${r.rawText}\nSources: ${r.report.sources
        .map((s) => s.uri)
        .join(", ")}`
  )
  .join("\n\n")}

Grounded Web URLs discovered:
${allGroundingSources.join("\n")}

Domains already in the user's report (try to prioritize NEW sites/domains or newly verified contacts not in this list):
${Array.from(existingDomains).slice(0, 40).join(", ")}

Generate a list of 6 to 10 concrete, actionable data exposure findings & data broker targets discovered by the swarm so the client can immediately send deletion emails via Gmail.
CRITICAL REQUIREMENTS:
1. Every finding MUST include a valid, realistic privacy/DPO email address in "contactEmail" (e.g. privacy@domain.com, dpo@domain.com, optout@domain.com, or the company's published privacy contact) so the client can email them directly with 1-click Gmail.
2. Provide a clean domain (e.g. "signalhire.com", "contactout.com", "clustrmaps.com", "nuwber.com", "cocofinder.com", "cyberbackgroundchecks.com", "thatsthem.com", "searchpeoplefree.com", "gladiknow.com", "idtrue.com", etc.).
3. Attribute each finding to the agentId that discovered it ("directories", "b2b-brokers", "social-archives", or "dpo-resolver").`;

    const synthesisResponse = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: synthesisPrompt,
      config: {
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
                description: "Clean domain name, e.g. signalhire.com",
              },
              category: {
                type: Type.STRING,
                description:
                  "One of: people-search, marketing, adtech, public-records, search",
              },
              contactEmail: {
                type: Type.STRING,
                description:
                  "Privacy officer or opt-out email address to send the removal request to, e.g. privacy@signalhire.com",
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

    return NextResponse.json({
      findings,
      reports,
    });
  } catch (err: unknown) {
    console.error("AI Swarm error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to run AI Reconnaissance Swarm.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
