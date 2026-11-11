import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { normaliseProfile, type RawProfileInput } from "@/lib/profile";
import type {
  BreachExposure,
  Category,
  DataType,
  Effort,
  ExposureMatchType,
  Finding,
  Risk,
  SwarmAgentReport,
  SwarmWebSource,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Total time the handler may spend looking things up. */
const SCAN_BUDGET_MS = 45_000;
/** Per-request ceiling for the Gemini client. */
const GEMINI_TIMEOUT_MS = 20_000;
/** Ceiling for a single search provider request. */
const PROVIDER_TIMEOUT_MS = 8_000;

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
  if (SEARCH_ENGINE_HOSTS.some((host) => clean === host || clean.endsWith(`.${host}`))) {
    return false;
  }
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean);
}

function domainFromUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .trim();
}

/**
 * Reads the configured Gemini key. Only explicit variable names are honoured,
 * so an unrelated key in the environment cannot be picked up by accident.
 */
function resolveGeminiApiKey(): string | undefined {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_GEMINI_API_KEY,
    process.env.GOOGLE_GENAI_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.GEMINI_KEY,
    process.env.GOOGLE_API_KEY,
  ];

  for (const candidate of candidates) {
    const cleaned = candidate?.trim().replace(/^["']|["']$/g, "").trim();
    if (!cleaned) continue;
    if (cleaned.length < 20 || /\s/.test(cleaned)) continue;
    return cleaned;
  }

  return undefined;
}

function maskKey(key?: string): string | null {
  if (!key) return null;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function getGeminiClient(apiKey: string, useVertex: boolean): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    vertexai: useVertex,
    ...(useVertex ? { location: "global" } : {}),
    httpOptions: {
      timeout: GEMINI_TIMEOUT_MS,
      headers: { "User-Agent": "untrace-scan" },
    },
  });
}

const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-2.5-flash"];
const PREFERRED_MODELS = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];
const modelCache = new Map<string, string[]>();

/** Asks the API which models this key can actually call, then orders them. */
async function listUsableModels(ai: GoogleGenAI, cacheKey: string): Promise<string[]> {
  const cached = modelCache.get(cacheKey);
  if (cached) return cached;

  let resolved: string[] = [];
  try {
    const pager = await ai.models.list();
    const names: string[] = [];
    for await (const model of pager) {
      const name = (model.name ?? "").replace(/^models\//, "");
      if (!name) continue;
      if (/embedding|embed|aqa|imagen|veo|gemma|learnlm/i.test(name)) continue;
      const actions = model.supportedActions;
      if (Array.isArray(actions) && actions.length > 0 && !actions.includes("generateContent")) {
        continue;
      }
      names.push(name);
    }
    const preferred = PREFERRED_MODELS.filter((model) => names.includes(model));
    const remaining = names
      .filter((model) => /flash/i.test(model) && !preferred.includes(model))
      .sort();
    resolved = [...preferred, ...remaining].slice(0, 3);
  } catch {
    resolved = [];
  }

  const finalList = resolved.length > 0 ? resolved : [...FALLBACK_MODELS];
  modelCache.set(cacheKey, finalList);
  return finalList;
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isAuthError(err: unknown): boolean {
  return /401|403|API_KEY_SERVICE_BLOCKED|API keys are not supported|UNAUTHENTICATED|PERMISSION_DENIED|ACCESS_TOKEN_TYPE|invalid api key|API_KEY_INVALID/i.test(
    errorText(err)
  );
}

function describeSearchError(err: unknown): string {
  const text = errorText(err);

  if (/API_KEY_INVALID|API key not valid|invalid api key/i.test(text)) {
    return "The Gemini API key was rejected as invalid. Create a key in Google AI Studio and set GEMINI_API_KEY in Vercel, then redeploy.";
  }
  if (isAuthError(err)) {
    return "The Gemini API rejected this key for the Developer API. Use an AI Studio key that starts with AIza, or run the request against Vertex instead.";
  }
  if (/RESOURCE_EXHAUSTED|quota|rate limit/i.test(text)) {
    return "The Gemini API quota for this key is exhausted. Use a key with billing enabled, or wait for the quota to reset.";
  }
  if (/grounding|google ?search|tool/i.test(text) && /not supported|unsupported|invalid/i.test(text)) {
    return "This model rejected the Google Search tool, so grounding cannot run with it. Pick a model that supports search grounding, or rely on the keyed search provider.";
  }
  if (/404|not found|NOT_FOUND/i.test(text)) {
    return "No Gemini model was available for this key. Check that the Generative Language API is enabled for the project that owns the key.";
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(text)) {
    return `The Gemini API could not be reached from the server (${text.slice(0, 120)}).`;
  }
  return text.slice(0, 300) || "The Gemini request failed.";
}

type GenerateOutcome = {
  response: unknown;
  model: string;
  endpoint: "developer" | "vertex";
};

/**
 * Runs a Gemini call against the Developer API first, then Vertex (express mode)
 * when the key is rejected there. Both paths use the same key.
 */
async function generateWithFallback(
  apiKey: string,
  contents: string,
  config: Record<string, unknown>
): Promise<GenerateOutcome> {
  const attempts: Array<{ endpoint: "developer" | "vertex"; ai: GoogleGenAI }> = [
    { endpoint: "developer", ai: getGeminiClient(apiKey, false) },
    { endpoint: "vertex", ai: getGeminiClient(apiKey, true) },
  ];

  let firstError: unknown = null;

  for (const attempt of attempts) {
    const models = await listUsableModels(attempt.ai, attempt.endpoint);
    let authFailed = false;

    for (const model of models) {
      try {
        const response = await attempt.ai.models.generateContent({
          model,
          contents,
          config,
        });
        return { response, model, endpoint: attempt.endpoint };
      } catch (err) {
        firstError = firstError ?? err;
        if (isAuthError(err)) {
          authFailed = true;
          break;
        }
      }
    }

    if (attempt.endpoint === "vertex" || authFailed) continue;
    throw firstError;
  }

  throw firstError ?? new Error("No Gemini model answered the request.");
}

/**
 * Runs a live Google Search grounded request.
 * Never combine responseMimeType="application/json" with tools: [{ googleSearch: {} }].
 */
async function generateGroundedSearch(
  apiKey: string,
  prompt: string
): Promise<GenerateOutcome> {
  return generateWithFallback(apiKey, prompt, { tools: [{ googleSearch: {} }] });
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
 * Resolves a vertexaisearch grounding redirect to the page it points at.
 * Follows the redirect first and falls back to reading the Location header.
 */
async function resolveRedirectUrl(uri: string): Promise<string> {
  if (!uri.includes("vertexaisearch.cloud.google.com")) {
    return uri;
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml",
  };

  try {
    const res = await fetch(uri, {
      redirect: "follow",
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (res.url && !res.url.includes("vertexaisearch.cloud.google.com")) {
      return res.url;
    }
    const location = res.headers.get("location");
    if (location && location.startsWith("http")) return location;
  } catch {
    // fall through to the manual attempt
  }

  try {
    const res = await fetch(uri, {
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(4000),
    });
    const location = res.headers.get("location");
    if (location && location.startsWith("http")) return location;
  } catch {
    // unresolved
  }

  return uri;
}

type GroundedMention = {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  contactEmail?: string;
};

/**
 * Extracts structured mentions from Gemini's text response and from Google
 * Search grounding chunks. Chunks are kept when the redirect resolves, and
 * identified by title only when the title carries a domain.
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
    const items: unknown[] = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null
        ? ((parsed as { results?: unknown[]; findings?: unknown[] }).results ??
          (parsed as { findings?: unknown[] }).findings ??
          [])
        : [];

    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const rawUrl = String(record.url || record.inspectUrl || record.removalUrl || "").trim();
      if (!rawUrl.startsWith("http")) continue;

      const rawDomain = domainFromUrl(
        String(record.domain || rawUrl).toLowerCase().includes("://")
          ? String(record.domain || rawUrl)
          : `https://${String(record.domain || rawUrl)}`
      );
      if (!isValidPublicDomain(rawDomain)) continue;

      const title = String(record.title || record.broker || rawDomain).trim();
      const snippet = String(record.snippet || record.summary || "").trim();
      if (!snippet) continue;

      const dedupKey = `${rawUrl.toLowerCase()}::${title.toLowerCase()}`;
      if (seenUrls.has(dedupKey)) continue;
      seenUrls.add(dedupKey);

      const contactEmail =
        typeof record.contactEmail === "string" && record.contactEmail.includes("@")
          ? record.contactEmail.trim()
          : undefined;

      mentions.push({ title, url: rawUrl, domain: rawDomain, snippet, contactEmail });
    }
  } catch {
    // Continue to grounding chunk extraction
  }

  // 2. Extract Google Search grounding chunks
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
    const resolvedUri = resolvedChunkUrls[idx] || chunk?.web?.uri || "";
    const rawTitle = chunk?.web?.title?.trim() || "";
    if (!resolvedUri) continue;

    let domain = "";
    if (!resolvedUri.includes("vertexaisearch.cloud.google.com")) {
      domain = domainFromUrl(resolvedUri);
    } else {
      const titleDomainMatch = rawTitle.match(/([a-z0-9-]+\.[a-z.]{2,})/i);
      if (titleDomainMatch) {
        domain = titleDomainMatch[1].toLowerCase().replace(/^www\./, "");
      }
    }

    if (!isValidPublicDomain(domain)) continue;

    const matchingSupportTexts = supports
      .filter((support) => support.groundingChunkIndices?.includes(idx))
      .map((support) => support.segment?.text?.trim() || "")
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

type ProviderHit = {
  title: string;
  url: string;
  snippet: string;
};

type SearchProvider = {
  name: string;
  isConfigured: () => boolean;
  search: (query: string, signal: AbortSignal) => Promise<ProviderHit[]>;
};

function envKey(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

const braveProvider: SearchProvider = {
  name: "Brave Search",
  isConfigured: () => Boolean(envKey("BRAVE_SEARCH_API_KEY", "BRAVE_API_KEY")),
  search: async (query, signal) => {
    const key = envKey("BRAVE_SEARCH_API_KEY", "BRAVE_API_KEY");
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20`,
      {
        headers: { Accept: "application/json", "X-Subscription-Token": key },
        signal,
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`Brave Search returned ${res.status}`);
    const data = (await res.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    return (data.web?.results ?? []).map((hit) => ({
      title: decodeHtmlEntities(hit.title ?? ""),
      url: hit.url ?? "",
      snippet: decodeHtmlEntities(hit.description ?? ""),
    }));
  },
};

const serperProvider: SearchProvider = {
  name: "Serper",
  isConfigured: () => Boolean(envKey("SERPER_API_KEY")),
  search: async (query, signal) => {
    const key = envKey("SERPER_API_KEY");
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "content-type": "application/json" },
      body: JSON.stringify({ q: query, num: 20 }),
      signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Serper returned ${res.status}`);
    const data = (await res.json()) as {
      organic?: Array<{ title?: string; link?: string; snippet?: string }>;
    };
    return (data.organic ?? []).map((hit) => ({
      title: decodeHtmlEntities(hit.title ?? ""),
      url: hit.link ?? "",
      snippet: decodeHtmlEntities(hit.snippet ?? ""),
    }));
  },
};

const tavilyProvider: SearchProvider = {
  name: "Tavily",
  isConfigured: () => Boolean(envKey("TAVILY_API_KEY")),
  search: async (query, signal) => {
    const key = envKey("TAVILY_API_KEY");
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, max_results: 20, search_depth: "basic" }),
      signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Tavily returned ${res.status}`);
    const data = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    return (data.results ?? []).map((hit) => ({
      title: decodeHtmlEntities(hit.title ?? ""),
      url: hit.url ?? "",
      snippet: decodeHtmlEntities((hit.content ?? "").slice(0, 400)),
    }));
  },
};

const googleCseProvider: SearchProvider = {
  name: "Google Programmable Search",
  isConfigured: () =>
    Boolean(
      envKey("GOOGLE_SEARCH_API_KEY", "GOOGLE_CSE_API_KEY") &&
        envKey("GOOGLE_SEARCH_CX", "GOOGLE_CSE_ID")
    ),
  search: async (query, signal) => {
    const key = envKey("GOOGLE_SEARCH_API_KEY", "GOOGLE_CSE_API_KEY");
    const cx = envKey("GOOGLE_SEARCH_CX", "GOOGLE_CSE_ID");
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(
        key
      )}&cx=${encodeURIComponent(cx)}&num=10&q=${encodeURIComponent(query)}`,
      { signal, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`Google Programmable Search returned ${res.status}`);
    const data = (await res.json()) as {
      items?: Array<{ title?: string; link?: string; snippet?: string }>;
    };
    return (data.items ?? []).map((hit) => ({
      title: decodeHtmlEntities(hit.title ?? ""),
      url: hit.link ?? "",
      snippet: decodeHtmlEntities(hit.snippet ?? ""),
    }));
  },
};

const duckDuckGoProvider: SearchProvider = {
  name: "DuckDuckGo",
  isConfigured: () => true,
  search: async (query, signal) => {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-GB,en;q=0.9",
        },
        signal,
        cache: "no-store",
      }
    );

    if (res.status === 202 || res.status === 429) {
      throw new Error(
        "DuckDuckGo blocked the request with a challenge page. Set BRAVE_SEARCH_API_KEY, SERPER_API_KEY or TAVILY_API_KEY for a search provider that allows server traffic."
      );
    }
    if (!res.ok) {
      throw new Error(`DuckDuckGo returned ${res.status}`);
    }

    const html = await res.text();
    if (/anomaly|unusual traffic|captcha/i.test(html) && !html.includes("result__a")) {
      throw new Error(
        "DuckDuckGo returned a challenge page instead of results. Set a search provider key to search from the server."
      );
    }

    const anchors = [
      ...html.matchAll(
        /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
      ),
    ];
    const snippets = [
      ...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g),
    ];

    const hits: ProviderHit[] = [];
    for (let index = 0; index < anchors.length; index++) {
      let url = anchors[index][1];
      const uddg = url.match(/uddg=([^&]+)/);
      if (uddg) {
        try {
          url = decodeURIComponent(uddg[1]);
        } catch {
          // keep the raw href
        }
      }
      if (!url.startsWith("http")) continue;
      hits.push({
        title: decodeHtmlEntities(anchors[index][2].replace(/<[^>]+>/g, "").trim()),
        url,
        snippet: decodeHtmlEntities(
          (snippets[index] ? snippets[index][1].replace(/<[^>]+>/g, "") : "").trim()
        ),
      });
    }
    return hits;
  },
};

const SEARCH_PROVIDERS: SearchProvider[] = [
  braveProvider,
  serperProvider,
  tavilyProvider,
  googleCseProvider,
  duckDuckGoProvider,
];

function remainingMs(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

type OpenWebResult = {
  mentions: GroundedMention[];
  provider: string | null;
  errors: string[];
};

/**
 * Searches the open web through the first configured provider that answers.
 * A provider that is blocked or misconfigured reports why, so the caller can
 * tell "nothing found" apart from "nothing searched".
 */
async function searchOpenWeb(
  mode: "phone" | "email",
  targetValue: string,
  deadline: number
): Promise<OpenWebResult> {
  const mentions: GroundedMention[] = [];
  const seenUrls = new Set<string>();
  const errors: string[] = [];

  const queries =
    mode === "phone" ? buildPhonePermutations(targetValue).slice(0, 3) : [targetValue];

  const providers = SEARCH_PROVIDERS.filter((provider) => provider.isConfigured());
  const failedProviders = new Set<string>();
  let usedProvider: string | null = null;

  for (const query of queries) {
    if (remainingMs(deadline) < 3000) break;

    for (const provider of providers) {
      if (usedProvider && provider.name !== usedProvider) continue;
      if (failedProviders.has(provider.name)) continue;
      if (remainingMs(deadline) < 3000) break;

      try {
        const hits = await provider.search(
          query,
          AbortSignal.timeout(Math.min(PROVIDER_TIMEOUT_MS, remainingMs(deadline)))
        );

        let added = 0;
        for (const hit of hits) {
          if (!hit.url.startsWith("http")) continue;
          const domain = domainFromUrl(hit.url);
          if (!isValidPublicDomain(domain)) continue;

          const dedupKey = hit.url.toLowerCase();
          if (seenUrls.has(dedupKey)) continue;
          seenUrls.add(dedupKey);

          mentions.push({
            title: hit.title || domain,
            url: hit.url,
            domain,
            snippet:
              hit.snippet || `Webpage on ${domain} mentioning "${targetValue}".`,
          });
          added += 1;
          if (mentions.length >= 10) break;
        }

        if (added > 0) {
          usedProvider = provider.name;
          break;
        }
      } catch (err) {
        const message = errorText(err).slice(0, 200);
        failedProviders.add(provider.name);
        errors.push(`${provider.name}: ${message}`);
        if (usedProvider === provider.name) usedProvider = null;
      }
    }

    if (mentions.length >= 8) break;
  }

  return { mentions, provider: usedProvider, errors: [...new Set(errors)] };
}

function providerStatus(): Record<string, boolean> {
  const status: Record<string, boolean> = {};
  for (const provider of SEARCH_PROVIDERS) {
    status[provider.name] = provider.isConfigured();
  }
  return status;
}

/**
 * Real check of the configured models, used by the self test. One token, one request.
 */
async function probeGemini(apiKey: string): Promise<{ model: string; endpoint: string }> {
  const outcome = await generateWithFallback(apiKey, "ping", { maxOutputTokens: 1 });
  return { model: outcome.model, endpoint: outcome.endpoint };
}

function buildGroundedPrompt(mode: "phone" | "email", targetValue: string): string {
  const perms = mode === "phone" ? buildPhonePermutations(targetValue) : [targetValue];
  const searchTermsFormatted = perms.map((term) => `"${term}"`).join(" OR ");
  const digits = targetValue.replace(/\D/g, "");
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  const emailParts =
    mode === "email" && targetValue.includes("@") ? targetValue.split("@") : [];

  if (mode === "phone") {
    return `Use Google Search to search for the exact phone number: ${searchTermsFormatted}
Also search Google for "${last10}".

CRITICAL INSTRUCTIONS:
1. Look at EVERY actual website, agency page, blog post, case study, portfolio, or directory returned by Google Search where the number "${targetValue}" (or "${last10}") is mentioned on the page.
2. Include ALL real webpages from the Google Search results (including multiple pages or blog posts from the same website if they appear in Google Search).
3. Do NOT invent or fabricate any websites, domains, or placeholder listings. If no real webpages in Google Search publish this phone number, return an empty JSON array: [].
4. Reply with ONLY a JSON array, no prose and no markdown, where each item has:
   - "title": Exact page title from Google Search
   - "url": Full https:// URL of the page from Google Search
   - "domain": Real website domain from the URL
   - "snippet": The exact snippet or context showing the phone number on that page
   - "contactEmail": Any owner, privacy, or contact email address visible on that site`;
  }

  return `Use Google Search to search for the exact email address: "${targetValue}" and ${targetValue}${
    emailParts.length === 2 ? ` and "${emailParts[0]}" "${emailParts[1]}"` : ""
  }.

CRITICAL INSTRUCTIONS:
1. Look at EVERY actual website, company page, agency site, blog post, case study, contact page, or directory returned by Google Search that shows or mentions the email address "${targetValue}".
2. Include ALL real webpages from the Google Search results (including multiple pages, case studies, or blog posts from the same website if they show this email address).
3. Do NOT invent or fabricate any websites, domains, or placeholder listings. If no real webpages in Google Search publish "${targetValue}", return an empty JSON array: [].
4. Reply with ONLY a JSON array, no prose and no markdown, where each item has:
   - "title": Exact page title from Google Search
   - "url": Full https:// URL of the page from Google Search
   - "domain": Real website domain from the URL
   - "snippet": The exact snippet or context showing how "${targetValue}" appears on that page
   - "contactEmail": A distinct owner, webmaster, or privacy contact email address for that website (do NOT set contactEmail to "${targetValue}")`;
}

export async function GET(request: Request) {
  const apiKey = resolveGeminiApiKey();
  const providers = providerStatus();
  const keyedProviders = Object.entries(providers)
    .filter(([name, ready]) => ready && name !== "DuckDuckGo")
    .map(([name]) => name);

  const base = {
    status: "ok",
    scanEngineReady: Boolean(apiKey),
    geminiActive: null as boolean | null,
    engine: [
      apiKey ? "Gemini Search Grounding (unverified, run ?selftest=1)" : null,
      ...keyedProviders,
      "DuckDuckGo",
    ]
      .filter(Boolean)
      .join(" + "),
    detectedKeyVariables: [
      "GEMINI_API_KEY",
      "GOOGLE_GEMINI_API_KEY",
      "GOOGLE_GENAI_API_KEY",
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "GEMINI_KEY",
      "GOOGLE_API_KEY",
    ].filter((name) => Boolean(process.env[name]?.trim())),
    keyMasked: maskKey(apiKey),
    searchProviders: providers,
    instruction: apiKey
      ? "A key is configured. Add ?selftest=1 to confirm the API accepts it."
      : "Set GEMINI_API_KEY in Vercel (Production and Preview), then redeploy.",
    fallbackNote:
      keyedProviders.length === 0
        ? "No keyed search provider is configured, so the fallback is DuckDuckGo, which blocks datacenter traffic. Set BRAVE_SEARCH_API_KEY, SERPER_API_KEY or TAVILY_API_KEY."
        : null,
  };

  const wantsSelfTest = new URL(request.url).searchParams.get("selftest") === "1";
  if (!wantsSelfTest) {
    return NextResponse.json(base, { headers: { "Cache-Control": "no-store" } });
  }

  const rate = checkRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json(
      { ...base, selftest: { ok: false, error: "Too many checks. Try again shortly." } },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  if (!apiKey) {
    return NextResponse.json(
      {
        ...base,
        selftest: { ok: false, error: "GEMINI_API_KEY is not set in this environment." },
      },
      { status: 503 }
    );
  }

  const startedAt = Date.now();
  const params = new URL(request.url).searchParams;
  const sample = params.get("sample")?.trim() || "";
  const sampleMode: "phone" | "email" =
    params.get("mode") === "email" ? "email" : "phone";

  try {
    const probe = await probeGemini(apiKey);

    // Second probe: does this key and model actually run a grounded search?
    let grounding: Record<string, unknown>;
    try {
      const grounded = await generateGroundedSearch(
        apiKey,
        'Search the web for "example.com" and reply with the single word: ok'
      );
      const chunks =
        (
          grounded.response as {
            candidates?: Array<{ groundingMetadata?: { groundingChunks?: unknown[] } }>;
          }
        )?.candidates?.[0]?.groundingMetadata?.groundingChunks?.length ?? 0;
      grounding = {
        ok: true,
        model: grounded.model,
        endpoint: grounded.endpoint,
        citations: chunks,
      };
    } catch (err) {
      console.error("Grounding self test failed:", err);
      grounding = {
        ok: false,
        error: describeSearchError(err),
        raw: errorText(err).slice(0, 500),
      };
    }

    let dryrun: Record<string, unknown> | null = null;
    if (sample) {
      try {
        const grounded = await generateGroundedSearch(
          apiKey,
          buildGroundedPrompt(sampleMode, sample)
        );
        const shaped = grounded.response as {
          text?: string;
          candidates?: Array<{ groundingMetadata?: { groundingChunks?: unknown[] } }>;
        };
        const text = shaped?.text ?? "";
        const mentions = await extractGroundedMentions(grounded.response, sample);
        dryrun = {
          ok: true,
          model: grounded.model,
          endpoint: grounded.endpoint,
          citations:
            shaped?.candidates?.[0]?.groundingMetadata?.groundingChunks?.length ?? 0,
          textChars: text.length,
          textPreview: text.slice(0, 300),
          parsedMentions: mentions.length,
          domains: mentions.slice(0, 5).map((mention) => mention.domain),
        };
      } catch (err) {
        console.error("Dry run failed:", err);
        dryrun = {
          ok: false,
          error: describeSearchError(err),
          raw: errorText(err).slice(0, 500),
        };
      }
    }

    return NextResponse.json(
      {
        ...base,
        geminiActive: true,
        selftest: {
          ok: true,
          model: probe.model,
          endpoint: probe.endpoint,
          latencyMs: Date.now() - startedAt,
          grounding,
          ...(dryrun ? { dryrun } : {}),
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ...base,
        selftest: {
          ok: false,
          latencyMs: Date.now() - startedAt,
          error: describeSearchError(err),
          raw: errorText(err).slice(0, 500),
        },
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
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

  const deadline = Date.now() + SCAN_BUDGET_MS;
  const apiKey = resolveGeminiApiKey();
  const allMentions: GroundedMention[] = [];
  const errors: string[] = [];
  let engine: string | null = null;

  // 1. Grounded Google Search through Gemini
  if (!apiKey) {
    errors.push("GEMINI_API_KEY is not set, so the grounded search did not run.");
  } else {
    try {
      const groundedPrompt = buildGroundedPrompt(mode, targetValue);

      const grounded = await generateGroundedSearch(apiKey, groundedPrompt);
      const mentions = await extractGroundedMentions(grounded.response, targetValue);

      if (mentions.length > 0) {
        allMentions.push(...mentions);
        engine = `Gemini ${grounded.model}`;
      }
    } catch (err) {
      console.error("Grounded search failed:", err);
      errors.push(describeSearchError(err));
    }
  }

  // 2. Open web search when the grounded search produced nothing
  if (allMentions.length === 0 && remainingMs(deadline) > 4000) {
    const web = await searchOpenWeb(mode, targetValue, deadline);
    if (web.mentions.length > 0) {
      allMentions.push(...web.mentions);
      engine = web.provider ?? engine;
    }
    errors.push(...web.errors);
  }

  // 3. Nothing searched at all is an error, not an empty report
  if (allMentions.length === 0 && errors.length > 0) {
    return NextResponse.json(
      {
        error: `No search could be completed, so nothing was checked. ${errors[0]}`,
        details: errors,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  const now = new Date().toISOString();
  const matchType: ExposureMatchType = mode;
  const lowerTargetEmail = mode === "email" ? targetValue.toLowerCase().trim() : "";

  const findings: Finding[] = allMentions.map((item, idx) => {
    const slug = `${item.domain}_${idx}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const id = `${mode}_${slug}`;

    const snippetEmails = (
      item.snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []
    ).filter((email) => email.toLowerCase() !== lowerTargetEmail);

    const itemContactCandidate =
      item.contactEmail && item.contactEmail.toLowerCase() !== lowerTargetEmail
        ? item.contactEmail
        : undefined;

    const resolvedEmail = itemContactCandidate || snippetEmails[0] || undefined;

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

  const sources: SwarmWebSource[] = findings.slice(0, 10).map((finding) => ({
    title: finding.broker,
    uri: finding.inspectUrl,
  }));

  const partial = errors.length > 0;
  const engineLabel = engine ?? "no search engine";

  const summary = partial
    ? `Partial report: ${findings.length} ${
        findings.length === 1 ? "page" : "pages"
      } from ${engineLabel}. ${errors[0]}`
    : findings.length > 0
      ? `Found ${findings.length} ${
          findings.length === 1 ? "webpage" : "webpages"
        } mentioning ${targetValue} via ${engineLabel}.`
      : `Searched via ${engineLabel} and found no public page mentioning ${targetValue}.`;

  const reports: SwarmAgentReport[] = [
    {
      agentId: mode === "phone" ? "directories" : "b2b-brokers",
      agentName:
        mode === "phone" ? "Phone Number Web Scanner" : "Email Address Web Scanner",
      role:
        mode === "phone"
          ? `Finds every webpage mentioning ${targetValue}`
          : `Finds every webpage showing ${targetValue}`,
      status: partial ? "error" : "completed",
      summary,
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
      engine,
      ...(partial ? { warning: errors.join(" ") } : {}),
    },
    {
      headers: {
        "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
        "X-RateLimit-Remaining": String(rate.remaining),
        "Cache-Control": "no-store",
      },
    }
  );
}
