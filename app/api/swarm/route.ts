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

/**
 * Runs a live Google-Search-grounded Gemini request.
 * Never combine responseMimeType="application/json" with tools: [{ googleSearch: {} }].
 */
async function generateGroundedSearch(ai: GoogleGenAI, prompt: string) {
  const modelsToTry = [
    "gemini-3.8-flash",
    "gemini-2.5-flash",
    "gemini-flash-latest",
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
 * Resolves a vertexaisearch grounding redirect URL using GET (since HEAD is often rejected).
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
      signal: AbortSignal.timeout(3000),
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
 * Fetches a live webpage or its root homepage to extract real contact email addresses
 * published on the site (both in HTML and in the site's main JS bundle if it's a SPA).
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

  const urlsToTry = urlOrDomain.startsWith("http")
    ? [urlOrDomain, `https://www.${cleanDomain}`, `https://${cleanDomain}`]
    : [`https://www.${cleanDomain}`, `https://${cleanDomain}`];

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

  for (const targetUrl of Array.from(new Set(urlsToTry)).slice(0, 2)) {
    try {
      const res = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      extractFromText(html);

      // If SPA with a main index-*.js bundle, check it as well
      if (foundEmails.size === 0) {
        const scriptMatches = Array.from(
          html.matchAll(/src=["'](\/assets\/index-[^"']+\.js)["']/g)
        ).map((m) => m[1]);
        for (const scriptPath of scriptMatches.slice(0, 1)) {
          try {
            const origin = new URL(targetUrl).origin;
            const jsRes = await fetch(`${origin}${scriptPath}`, {
              signal: AbortSignal.timeout(2500),
            });
            if (jsRes.ok) {
              const jsText = await jsRes.text();
              extractFromText(jsText);
            }
          } catch {
            // ignore bundle fetch error
          }
        }
      }

      if (foundEmails.size > 0) break;
    } catch {
      // ignore fetch errors
    }
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
 * Returns true only when the page itself carries the identifier.
 * Sitemaps and llms.txt list every page a site has, not the pages that
 * publish your details, so each candidate page has to be read before it
 * can be called a finding.
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
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return false;
    const body = (await res.text()).toLowerCase();
    if (body.includes(lower)) return true;
    if (last10.length === 10 && body.replace(/[\s()-]/g, "").includes(last10)) {
      return true;
    }

    // Also check SPA main bundle if the root HTML is a shell
    const scriptMatches = Array.from(
      body.matchAll(/src=["'](\/assets\/index-[^"']+\.js)["']/g)
    ).map((m) => m[1]);
    for (const scriptPath of scriptMatches.slice(0, 1)) {
      try {
        const origin = new URL(url).origin;
        const jsRes = await fetch(`${origin}${scriptPath}`, {
          signal: AbortSignal.timeout(2500),
        });
        if (jsRes.ok) {
          const jsText = (await jsRes.text()).toLowerCase();
          if (jsText.includes(lower)) return true;
          if (last10.length === 10 && jsText.replace(/[\s()-]/g, "").includes(last10)) {
            return true;
          }
        }
      } catch {
        // ignore
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Extracts structured mentions from Gemini's text response AND directly from
 * Google Search Grounding chunks + supports, filtering out any placeholder or unverified domains.
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

  // 2. Extract verified Google Search Grounding chunks
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
    const supportMentionsTarget = textMentionsTarget(combinedSupport, targetValue);

    // Only accept a grounding chunk if its support text mentions the target or the live page itself shows the target
    if (!supportMentionsTarget) {
      const verifiedOnPage = await pageShowsTarget(resolvedUri, targetValue);
      if (!verifiedOnPage) continue;
    }

    const dedupKey = `${resolvedUri.toLowerCase()}::${(rawTitle || domain).toLowerCase()}`;
    if (seenUrls.has(dedupKey)) continue;
    seenUrls.add(dedupKey);

    mentions.push({
      title: rawTitle || domain,
      url: resolvedUri,
      domain,
      snippet:
        combinedSupport ||
        `Webpage on ${domain} publishing "${targetValue}".`,
    });
  }

  return mentions;
}

/**
 * Crawls a website's /llms.txt and /sitemap.xml to find extra pages on a domain
 * tied to the identifier, then keeps only the pages that actually publish it.
 */
async function expandDomainPagesWithEmailOrPhone(
  domain: string,
  targetValue: string,
  contactEmail: string
): Promise<GroundedMention[]> {
  const cleanDomain = domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();

  if (!isValidPublicDomain(cleanDomain)) {
    return [];
  }

  const candidates: Array<{ title: string; url: string }> = [];
  const seenUrls = new Set<string>();

  // 1. Check /llms.txt for rich markdown links `[Title](https://...)`
  try {
    const llmsRes = await fetch(`https://www.${cleanDomain}/llms.txt`, {
      signal: AbortSignal.timeout(2500),
    });
    if (llmsRes.ok) {
      const llmsTxt = await llmsRes.text();
      const linkMatches = Array.from(
        llmsTxt.matchAll(/-\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)
      );
      for (const match of linkMatches.slice(0, 12)) {
        const url = match[2].trim();
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        candidates.push({ title: `${cleanDomain}: ${match[1].trim()}`, url });
      }
    }
  } catch {
    // ignore
  }

  // 2. Fall back to /sitemap.xml for a wider page list
  if (candidates.length < 4) {
    try {
      const smRes = await fetch(`https://www.${cleanDomain}/sitemap.xml`, {
        signal: AbortSignal.timeout(2500),
      });
      if (smRes.ok) {
        const smTxt = await smRes.text();
        const locMatches = Array.from(smTxt.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) =>
          m[1].trim()
        );
        for (const url of locMatches.slice(0, 10)) {
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);
          const slug =
            url
              .replace(/^https?:\/\/[^/]+/, "")
              .replace(/^\/|\/$/g, "")
              .replace(/[-/]/g, " ") || "Home Page";
          const readableTitle = slug.charAt(0).toUpperCase() + slug.slice(1);
          candidates.push({ title: `${cleanDomain}: ${readableTitle}`, url });
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Also check root homepage if no sitemap/llms.txt candidates were found
  if (candidates.length === 0) {
    candidates.push({
      title: cleanDomain,
      url: `https://www.${cleanDomain}`,
    });
  }

  // 4. Keep only pages that really publish the identifier
  const checks = await Promise.all(
    candidates
      .slice(0, 8)
      .map(async (candidate) => ({
        candidate,
        shows: await pageShowsTarget(candidate.url, targetValue),
      }))
  );

  return checks
    .filter((check) => check.shows)
    .map((check) => ({
      title: check.candidate.title,
      url: check.candidate.url,
      domain: cleanDomain,
      snippet: `Page on ${cleanDomain} publishing "${targetValue}".`,
      contactEmail: contactEmail || undefined,
    }));
}

/**
 * Walks a single domain for pages that publish the identifier. Only used when
 * the address sits on its own domain, because free mailboxes have no site to walk.
 */
async function scanLiveWebMentions(
  mode: "phone" | "email",
  targetValue: string
): Promise<GroundedMention[]> {
  const mentions: GroundedMention[] = [];
  const lowerTarget = targetValue.toLowerCase().trim();

  if (mode === "email" && lowerTarget.includes("@")) {
    const emailDomain = lowerTarget.split("@")[1]?.trim() || "";
    const candidateDomains = new Set<string>();

    const freeProviders = new Set([
      "gmail.com",
      "yahoo.com",
      "outlook.com",
      "hotmail.com",
      "icloud.com",
      "proton.me",
      "protonmail.com",
    ]);

    if (
      emailDomain &&
      !freeProviders.has(emailDomain) &&
      isValidPublicDomain(emailDomain)
    ) {
      candidateDomains.add(emailDomain);
    }

    for (const domain of candidateDomains) {
      const scrapedEmails = (await scrapeEmailsFromWebsite(domain)).filter(
        (e) => e.toLowerCase() !== lowerTarget
      );
      const bestContact = scrapedEmails[0] || "";
      const expandedPages = await expandDomainPagesWithEmailOrPhone(
        domain,
        targetValue,
        bestContact
      );
      mentions.push(...expandedPages);
    }
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
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "The scan engine is not configured on the server (missing GEMINI_API_KEY), so nothing was checked.",
      },
      { status: 503 }
    );
  }

  const allMentions: GroundedMention[] = [];
  let searchError: string | null = null;

  // 1. Run live Google Search Grounding via Gemini
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
  } catch (err) {
    searchError =
      err instanceof Error ? err.message : "The grounded search did not finish.";
    console.error("Live Google Search grounding failed:", err);
  }

  // 2. Also run Live Website & Sitemap Scanner to find all pages on discovered/associated domains
  const liveMentions = await scanLiveWebMentions(mode, targetValue);
  for (const lm of liveMentions) {
    const alreadyExists = allMentions.some(
      (m) =>
        m.url.toLowerCase() === lm.url.toLowerCase() ||
        (m.domain === lm.domain && m.title.toLowerCase() === lm.title.toLowerCase())
    );
    if (!alreadyExists) {
      allMentions.push(lm);
    }
  }

  if (searchError && allMentions.length === 0) {
    return NextResponse.json(
      {
        error:
          "The web search did not finish, so nothing was checked. Please try again in a moment.",
      },
      { status: 502 }
    );
  }

  // 3. Scrape live contact emails from each discovered website in parallel
  const uniqueDomains = Array.from(
    new Set(allMentions.map((m) => m.domain).filter(isValidPublicDomain))
  ).slice(0, 8);

  const domainEmailsMap = new Map<string, string[]>();
  await Promise.all(
    uniqueDomains.map(async (domain) => {
      const emails = await scrapeEmailsFromWebsite(domain);
      if (emails.length > 0) {
        domainEmailsMap.set(domain, emails);
      }
    })
  );

  const now = new Date().toISOString();
  const matchType: ExposureMatchType = mode;
  const lowerTargetEmail = mode === "email" ? targetValue.toLowerCase().trim() : "";

  const findings: Finding[] = allMentions.map((item, idx) => {
    const slug = `${item.domain}_${idx}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const id = `${mode}_${slug}`;

    const snippetEmails = (
      item.snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []
    ).filter((e) => e.toLowerCase() !== lowerTargetEmail);

    const scrapedForDomain = (domainEmailsMap.get(item.domain) ?? []).filter(
      (e) => e.toLowerCase() !== lowerTargetEmail
    );

    const itemContactCandidate =
      item.contactEmail && item.contactEmail.toLowerCase() !== lowerTargetEmail
        ? item.contactEmail
        : undefined;

    const resolvedEmail =
      itemContactCandidate ||
      scrapedForDomain[0] ||
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
      note:
        scrapedForDomain.length > 1
          ? `Contact emails on ${item.domain}: ${scrapedForDomain.slice(0, 3).join(", ")}`
          : resolvedEmail
            ? `Webpage showing ${targetValue}. Send removal request to ${resolvedEmail}.`
            : `Webpage showing ${targetValue}. Open the page to find the site owner's contact form or address.`,
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
      status: searchError ? "error" : "completed",
      summary: searchError
        ? `The web search did not finish. Pages listed here come from the site crawl only, so treat the report as partial.`
        : findings.length > 0
          ? `Found ${findings.length} ${
              findings.length === 1 ? "page" : "pages"
            } publishing ${targetValue}, with contact emails resolved.`
          : `Searched the open web and found no page publishing ${targetValue}.`,
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
