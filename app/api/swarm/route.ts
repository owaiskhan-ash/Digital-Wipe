import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { normaliseProfile, type RawProfileInput } from "@/lib/profile";
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
  SwarmAgentReport,
  SwarmWebSource,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const ipRequestTimestamps = new Map<string, number[]>();

function checkRateLimit(request: Request): {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
} {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const clientIp =
    (forwarded ? forwarded.split(",")[0]?.trim() : realIp?.trim()) || "global";

  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (ipRequestTimestamps.get(clientIp) ?? []).filter(
    (ts) => ts > windowStart
  );

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldestInWindow = recent[0] ?? now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldestInWindow + RATE_LIMIT_WINDOW_MS - now) / 1000)
    );
    ipRequestTimestamps.set(clientIp, recent);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  recent.push(now);
  ipRequestTimestamps.set(clientIp, recent);

  if (ipRequestTimestamps.size > 1000) {
    for (const [ip, timestamps] of ipRequestTimestamps.entries()) {
      if (timestamps.every((ts) => ts <= windowStart)) {
        ipRequestTimestamps.delete(ip);
      }
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - recent.length),
    retryAfterSeconds: 0,
  };
}

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

function isValidPublicDomain(domain: string): boolean {
  const clean = domain.toLowerCase().trim();
  if (!clean || !clean.includes(".")) return false;
  if (clean.endsWith(".web") || clean.endsWith(".invalid") || clean.endsWith(".local")) {
    return false;
  }
  if (RESERVED_OR_FAKE_DOMAINS.has(clean)) return false;
  for (const reserved of RESERVED_OR_FAKE_DOMAINS) {
    if (clean.endsWith(`.${reserved}`)) return false;
  }
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean);
}

/**
 * Discovers a configured Gemini API key across any common environment variable name.
 */
function resolveGeminiApiKey(): string | undefined {
  const cleanKey = (val?: string) =>
    val ? val.trim().replace(/^["']|["']$/g, "").trim() : "";

  const directCandidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_GENAI_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.GEMINI_KEY,
    process.env.GEMINI_TOKEN,
    process.env.GEMINI_SECRET,
    process.env.GEMINI,
    process.env.GOOGLE_AI_KEY,
    process.env.GOOGLE_AI_API_KEY,
    process.env.GENAI_API_KEY,
    process.env.NEXT_PUBLIC_GEMINI_API_KEY,
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
    process.env.NEXT_PUBLIC_GEMINI_KEY,
    process.env.NEXT_PUBLIC_API_KEY,
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

let cachedKeyStatus: { key: string; valid: boolean; lastChecked: number } | null = null;

async function isApiKeyFunctional(key?: string): Promise<boolean> {
  if (!key || key.length < 20) return false;
  const now = Date.now();
  if (
    cachedKeyStatus &&
    cachedKeyStatus.key === key &&
    now - cachedKeyStatus.lastChecked < 120_000
  ) {
    return cachedKeyStatus.valid;
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
      { signal: AbortSignal.timeout(1800) }
    );
    const valid = res.ok;
    cachedKeyStatus = { key, valid, lastChecked: now };
    return valid;
  } catch {
    return false;
  }
}

export async function GET() {
  const apiKey = resolveGeminiApiKey();
  const functional = await isApiKeyFunctional(apiKey);
  const directKeys = [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENAI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GEMINI_KEY",
    "GEMINI_TOKEN",
    "GEMINI_SECRET",
    "GEMINI",
    "GOOGLE_AI_KEY",
    "GOOGLE_AI_API_KEY",
    "GENAI_API_KEY",
    "NEXT_PUBLIC_GEMINI_API_KEY",
    "NEXT_PUBLIC_GOOGLE_API_KEY",
    "API_KEY",
  ];
  const detectedKeys = directKeys.filter((k) => {
    const val = process.env[k];
    return typeof val === "string" && val.trim().length > 0;
  });

  return NextResponse.json({
    status: "ok",
    scanEngineReady: true,
    geminiActive: functional,
    engine: functional ? "Google Search Grounding (Gemini)" : "Open-Web Search Engine",
    detectedKeyVariables: detectedKeys,
    keyMasked: apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : null,
    instruction: functional
      ? "Gemini Search Grounding is active and ready."
      : "Open-Web Search Engine is active. To enable Gemini Search Grounding, select or add an active API key in Settings > Secrets.",
  });
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

/**
 * Runs a live Google-Search-grounded Gemini request.
 * Never combine responseMimeType="application/json" with tools: [{ googleSearch: {} }].
 */
async function generateGroundedSearch(ai: GoogleGenAI, prompt: string) {
  const modelsToTry = [
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
  ];

  let lastErr: unknown = null;
  for (const model of modelsToTry) {
    try {
      return await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
    } catch (err: unknown) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("Grounded search failed across all models");
}

function buildPhonePermutations(rawPhone: string): string[] {
  const trimmed = rawPhone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return [trimmed];

  const perms = new Set<string>([trimmed, digits]);
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  perms.add(last10);

  if (last10.length === 10) {
    perms.add(`+91 ${last10}`);
    perms.add(`+91${last10}`);
    perms.add(`${last10.slice(0, 5)} ${last10.slice(5)}`);
    perms.add(`${last10.slice(0, 5)}-${last10.slice(5)}`);
    perms.add(`${last10.slice(0, 3)}-${last10.slice(3, 6)}-${last10.slice(6)}`);
  }

  if (digits.length > 10) {
    const cc = digits.slice(0, digits.length - 10);
    perms.add(`+${cc} ${last10}`);
    perms.add(`+${cc}${last10}`);
  }

  return Array.from(perms).slice(0, 6);
}

/**
 * Resolves a vertexaisearch grounding redirect URL using GET with short timeout.
 */
async function resolveRedirectUrl(uri: string): Promise<string> {
  if (!uri.includes("vertexaisearch.cloud.google.com")) {
    return uri;
  }
  try {
    const res = await fetch(uri, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(1500),
    });
    const loc = res.headers.get("location");
    if (loc && loc.startsWith("http")) {
      return loc;
    }
  } catch {
    // ignore timeout
  }
  return uri;
}

/**
 * Fetches a website's homepage to quickly extract contact emails.
 */
async function scrapeEmailsFromWebsite(urlOrDomain: string): Promise<string[]> {
  const cleanDomain = urlOrDomain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();

  if (!isValidPublicDomain(cleanDomain)) {
    return [];
  }

  const foundEmails = new Set<string>();
  const ignoredEmailPatterns =
    /\.(png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|css|js)$|example\.com|example\.org|example\.net|sentry\.io|wixpress\.com|schema\.org|company\.com|yourdomain/i;

  const extractFromText = (txt: string) => {
    const matches = txt.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
    for (const rawEmail of matches) {
      const clean = rawEmail.trim().replace(/^[.,;]+|[.,;]+$/g, "");
      if (!ignoredEmailPatterns.test(clean) && clean.length <= 64) {
        foundEmails.add(clean);
      }
    }
  };

  const targetUrl = urlOrDomain.startsWith("http")
    ? urlOrDomain
    : `https://www.${cleanDomain}`;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(1800),
    });
    if (res.ok) {
      const html = await res.text();
      extractFromText(html);
    }
  } catch {
    // ignore fetch errors
  }

  return Array.from(foundEmails);
}

type GroundedMention = {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  contactEmail?: string;
};

function textMentionsTarget(text: string, targetValue: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerTarget = targetValue.toLowerCase().trim();
  if (lowerTarget && lowerText.includes(lowerTarget)) return true;
  const digits = lowerTarget.replace(/\D/g, "");
  const last10 = digits.length >= 10 ? digits.slice(-10) : "";
  if (last10.length === 10 && lowerText.replace(/[\s()-]/g, "").includes(last10)) {
    return true;
  }
  return false;
}

/**
 * Fast check whether a page carries the identifier, with a strict 1500ms timeout.
 */
async function pageShowsTarget(url: string, targetValue: string): Promise<boolean> {
  const lower = targetValue.toLowerCase().trim();
  const digits = lower.replace(/\D/g, "");
  const last10 = digits.length >= 10 ? digits.slice(-10) : "";

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    const body = (await res.text()).toLowerCase();
    if (body.includes(lower)) return true;
    if (last10.length === 10 && body.replace(/[\s()-]/g, "").includes(last10)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Extracts structured mentions from Gemini's text response and Google Search Grounding chunks.
 * Uses fast parallel processing so scans never stall.
 */
async function extractGroundedMentions(
  response: unknown,
  targetValue: string
): Promise<GroundedMention[]> {
  const mentions: GroundedMention[] = [];
  const seenUrls = new Set<string>();

  const respObj = response as {
    text?: string;
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
        }>;
        groundingSupports?: Array<{
          segment?: { text?: string };
          groundingChunkIndices?: number[];
        }>;
      };
    }>;
  };

  const text = respObj?.text ?? "";

  // 1. Parse any JSON array inside the response text
  try {
    const jsonBlockMatch =
      text.match(/```(?:json)?\s*([\s\S]*?)```/i) ||
      text.match(/(\[\s*\{[\s\S]*\}\s*\])/);
    const candidateJson = jsonBlockMatch ? jsonBlockMatch[1] : text;
    const parsed = JSON.parse(candidateJson.trim());
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (!item || typeof item !== "object") continue;
        const rawUrl = String(item.url || item.inspectUrl || item.removalUrl || "").trim();
        const rawDomain = String(item.domain || rawUrl || "")
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .split("/")[0]
          .trim();

        if (!isValidPublicDomain(rawDomain)) continue;
        if (!rawUrl.startsWith("http")) continue;

        const title = String(item.title || item.broker || rawDomain).trim();
        const snippet = String(item.snippet || item.summary || "").trim();
        if (!snippet) continue;

        const dedupKey = `${rawUrl.toLowerCase()}::${title.toLowerCase()}`;
        if (seenUrls.has(dedupKey)) continue;
        seenUrls.add(dedupKey);

        mentions.push({
          title,
          url: rawUrl,
          domain: rawDomain,
          snippet,
          contactEmail:
            typeof item.contactEmail === "string" && item.contactEmail.includes("@")
              ? item.contactEmail.trim()
              : undefined,
        });
      }
    }
  } catch {
    // Continue to groundingChunks extraction
  }

  // 2. Extract verified Google Search Grounding chunks in parallel
  const metadata = respObj?.candidates?.[0]?.groundingMetadata;
  const chunks = metadata?.groundingChunks ?? [];
  const supports = metadata?.groundingSupports ?? [];

  const resolvedChunkUrls = await Promise.all(
    chunks.map(async (chunk) => {
      const rawUri = chunk?.web?.uri || "";
      if (!rawUri) return "";
      return await resolveRedirectUrl(rawUri);
    })
  );

  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    const rawUri = chunk?.web?.uri || "";
    const resolvedUri = resolvedChunkUrls[idx] || rawUri;
    const rawTitle = chunk?.web?.title?.trim() || "";
    if (!resolvedUri) continue;

    let domain = "";
    if (!resolvedUri.includes("vertexaisearch.cloud.google.com")) {
      domain = resolvedUri
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0]
        .trim();
    } else {
      const titleDomainMatch = rawTitle.match(/([a-z0-9-]+\.[a-z.]{2,})/i);
      if (titleDomainMatch) {
        domain = titleDomainMatch[1].toLowerCase().replace(/^www\./, "");
      }
    }

    if (!isValidPublicDomain(domain)) continue;

    const matchingSupportTexts = supports
      .filter((s) => s.groundingChunkIndices?.includes(idx))
      .map((s) => s.segment?.text?.trim() || "")
      .filter(Boolean);

    const combinedSupport = matchingSupportTexts.join(" · ");

    const dedupKey = `${resolvedUri.toLowerCase()}::${(rawTitle || domain).toLowerCase()}`;
    if (seenUrls.has(dedupKey)) continue;
    seenUrls.add(dedupKey);

    mentions.push({
      title: rawTitle || domain,
      url: resolvedUri,
      domain,
      snippet:
        combinedSupport ||
        `Google Search result on ${domain} mentioning "${targetValue}".`,
    });
  }

  return mentions;
}
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
}




/**
 * Searches the open web directly via search engine endpoints.
 * Provides resilient, high-speed discovery of web pages mentioning the phone or email.
 */
async function performOpenWebSearch(
  mode: "phone" | "email",
  targetValue: string
): Promise<GroundedMention[]> {
  const mentions: GroundedMention[] = [];
  const seenUrls = new Set<string>();

  const queries =
    mode === "phone"
      ? buildPhonePermutations(targetValue).slice(0, 3)
      : [targetValue];

  for (const q of queries) {
    try {
      const searchUrl = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q);
      const res = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(3500),
      });

      if (!res.ok) continue;
      const html = await res.text();

      const linkMatches = [
        ...html.matchAll(
          /<a[^>]+class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
        ),
      ];
      const titleMatches = [
        ...html.matchAll(/<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>/g),
      ];
      const snippetMatches = [
        ...html.matchAll(
          /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
        ),
      ];

      for (let i = 0; i < linkMatches.length; i++) {
        const rawHref = linkMatches[i][1];
        let actualUrl = rawHref;
        const uddgMatch = rawHref.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          try {
            actualUrl = decodeURIComponent(uddgMatch[1]);
          } catch {
            actualUrl = rawHref;
          }
        }

        if (!actualUrl.startsWith("http")) continue;

        const rawDomain = actualUrl
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .split("/")[0]
          .trim();

        if (!isValidPublicDomain(rawDomain)) continue;

        const rawTitle = titleMatches[i]
          ? titleMatches[i][1].replace(/<[^>]+>/g, "").trim()
          : rawDomain;
        const rawSnippet = snippetMatches[i]
          ? snippetMatches[i][1].replace(/<[^>]+>/g, "").trim()
          : "Webpage on " + rawDomain + " mentioning \"" + targetValue + "\".";

        const title = decodeHtmlEntities(rawTitle);
        const snippet = decodeHtmlEntities(rawSnippet);

        const dedupKey = actualUrl.toLowerCase();
        if (seenUrls.has(dedupKey)) continue;
        seenUrls.add(dedupKey);

        mentions.push({
          title: title || rawDomain,
          url: actualUrl,
          domain: rawDomain,
          snippet,
        });

        if (mentions.length >= 12) break;
      }
    } catch {
      // Continue next query
    }
    if (mentions.length >= 8) break;
  }

  return mentions;
}

export async function POST(request: Request) {
  const rate = checkRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Rate limit exceeded. Please wait ${rate.retryAfterSeconds} seconds before running another scan.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rate.retryAfterSeconds),
          "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  let payload: {
    mode?: "phone" | "email";
    phone?: string;
    email?: string;
    fullName?: string;
    profile?: RawProfileInput;
  };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const rawProfile = normaliseProfile(payload.profile ?? {});
  const phoneTarget = (payload.phone ?? rawProfile.phones[0] ?? "").trim();
  const emailTarget = (payload.email ?? rawProfile.emails[0] ?? "").trim();
  const mode: "phone" | "email" =
    payload.mode === "email" || (!phoneTarget && Boolean(emailTarget))
      ? "email"
      : "phone";

  const targetValue = mode === "phone" ? phoneTarget : emailTarget;
  if (!targetValue || targetValue.length < 4) {
    return NextResponse.json(
      {
        error:
          mode === "phone"
            ? "Please enter a valid phone number to scan."
            : "Please enter a valid email address to scan.",
      },
      { status: 422 }
    );
  }

  const profile: Profile = {
    fullName:
      payload.fullName?.trim() ||
      rawProfile.fullName ||
      (emailTarget ? emailTarget.split("@")[0] : "") ||
      targetValue,
    city: rawProfile.city || "",
    region: rawProfile.region || "",
    country: rawProfile.country || "United States",
    emails: emailTarget ? [emailTarget] : rawProfile.emails,
    phones: phoneTarget ? [phoneTarget] : rawProfile.phones,
    usernames: rawProfile.usernames,
  };

  const apiKey = resolveGeminiApiKey();
  const allMentions: GroundedMention[] = [];
  let searchError: string | null = null;

  // 1. If Gemini API key is functional, run live Google Search Grounding via Gemini
  const canUseGemini = await isApiKeyFunctional(apiKey);
  if (apiKey && canUseGemini) {
    try {
      const ai = getGeminiClient(apiKey);
      const perms =
        mode === "phone" ? buildPhonePermutations(targetValue) : [targetValue];
      const searchTermsFormatted = perms.map((p) => `"${p}"`).join(" OR ");
      const emailParts =
        mode === "email" && targetValue.includes("@")
          ? targetValue.split("@")
          : [];

      const groundedPrompt =
        mode === "phone"
          ? `Use Google Search to search for the exact phone number: ${searchTermsFormatted}
Also search Google for "${targetValue.replace(/\D/g, "").slice(-10)}".

CRITICAL INSTRUCTIONS:
1. Look at EVERY actual website, agency page, blog post, case study, portfolio, or directory returned by Google Search where the number "${targetValue}" (or "${targetValue.replace(/\D/g, "").slice(-10)}") is mentioned on the page.
2. Include ALL real webpages from the Google Search results (including multiple pages or blog posts from the same website if they appear in Google Search).
3. Do NOT invent or fabricate any websites, domains, or placeholder listings. If no real webpages in Google Search publish this phone number, return an empty JSON array: [].
4. Return a JSON array inside a \`\`\`json code block where each item has:
   - "title": Exact page title from Google Search
   - "url": Full https:// URL of the page from Google Search
   - "domain": Real website domain from the URL
   - "snippet": The exact snippet or context showing the phone number on that page
   - "contactEmail": Any owner, privacy, or contact email address visible on that site`
          : `Use Google Search to search for the exact email address: "${targetValue}" and ${targetValue}${
              emailParts.length === 2
                ? ` and "${emailParts[0]}" "${emailParts[1]}"`
                : ""
            }.

CRITICAL INSTRUCTIONS:
1. Look at EVERY actual website, company page, agency site, blog post, case study, contact page, or directory returned by Google Search that shows or mentions the email address "${targetValue}".
2. Include ALL real webpages from the Google Search results (including multiple pages, case studies, or blog posts from the same website if they show this email address).
3. Do NOT invent or fabricate any websites, domains, or placeholder listings. If no real webpages in Google Search publish "${targetValue}", return an empty JSON array: [].
4. Return a JSON array inside a \`\`\`json code block where each item has:
   - "title": Exact page title from Google Search
   - "url": Full https:// URL of the page from Google Search
   - "domain": Real website domain from the URL
   - "snippet": The exact snippet or context showing how "${targetValue}" appears on that page
   - "contactEmail": A distinct owner, webmaster, or privacy contact email address for that website (do NOT set contactEmail to "${targetValue}")`;

      const response = await generateGroundedSearch(ai, groundedPrompt);
      const grounded = await extractGroundedMentions(response, targetValue);
      allMentions.push(...grounded);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      searchError = errMsg;
      if (apiKey) {
        cachedKeyStatus = { key: apiKey, valid: false, lastChecked: Date.now() };
      }
    }
  }

  // 2. Open-Web Search Engine Fallback
  // If Gemini was unconfigured, had an invalid key, or returned 0 mentions:
  if (allMentions.length === 0) {
    const webMentions = await performOpenWebSearch(mode, targetValue);
    allMentions.push(...webMentions);
  }

  const now = new Date().toISOString();
  const matchType: ExposureMatchType = mode;
  const lowerTargetEmail = mode === "email" ? targetValue.toLowerCase().trim() : "";

  const findings: Finding[] = allMentions.map((item, idx) => {
    const slug = `${item.domain}_${idx}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const id = `${mode}_${slug}`;

    const snippetEmails = (
      item.snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []
    ).filter((e) => e.toLowerCase() !== lowerTargetEmail);

    const itemContactCandidate =
      item.contactEmail && item.contactEmail.toLowerCase() !== lowerTargetEmail
        ? item.contactEmail
        : undefined;

    const resolvedEmail =
      itemContactCandidate ||
      snippetEmails[0] ||
      undefined;

    const dataFields: DataType[] =
      mode === "phone"
        ? snippetEmails.length > 0
          ? ["phone", "email", "fullName"]
          : ["phone", "fullName"]
        : ["email", "fullName"];

    const category: Category = "search";
    const risk: Risk = "high";
    const effort: Effort = "easy";

    return {
      id,
      brokerId: id,
      broker: item.title.slice(0, 95),
      domain: item.domain,
      category,
      data: dataFields,
      risk,
      effort,
      fix: "email",
      removalUrl: item.url,
      contactEmail: resolvedEmail,
      inspectUrl: item.url,
      firstSeen: now,
      lastSeen: now,
      summary: item.snippet,
      note: resolvedEmail
        ? `Webpage showing ${targetValue}. Contact email: ${resolvedEmail}.`
        : `Webpage showing ${targetValue}. Contact email can be resolved on-demand in dashboard.`,
      discoveredByAgent:
        mode === "phone" ? "Phone Number Web Scan" : "Email Address Web Scan",
      matchType,
      matchedValue: targetValue,
    };
  });

  const sources: SwarmWebSource[] = findings.slice(0, 10).map((f) => ({
    title: f.broker,
    uri: f.inspectUrl,
  }));

  const reports: SwarmAgentReport[] = [
    {
      agentId: mode === "phone" ? "directories" : "b2b-brokers",
      agentName:
        mode === "phone" ? "Phone Number Web Scanner" : "Email Address Web Scanner",
      role:
        mode === "phone"
          ? `Finds every webpage mentioning ${targetValue}`
          : `Finds every webpage showing ${targetValue}`,
      status: "completed",
      summary:
        findings.length > 0
          ? `Found ${findings.length} ${
              findings.length === 1 ? "webpage" : "webpages"
            } mentioning ${targetValue} across public web indexes.`
          : `Searched the open web and found no public page mentioning ${targetValue}.`,
      queriesRun: [targetValue],
      sources,
      findingsCount: findings.length,
      completedAt: now,
    },
  ];

  const breaches: BreachExposure[] = [];

  return NextResponse.json(
    {
      findings,
      reports,
      breaches,
      checked: findings.length,
      ...(searchError ? { warning: searchError } : {}),
    },
    {
      headers: {
        "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
        "X-RateLimit-Remaining": String(rate.remaining),
      },
    }
  );
}
