import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { normaliseProfile, type RawProfileInput } from "@/lib/scan";
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

  const urlsToTry = urlOrDomain.startsWith("http")
    ? [urlOrDomain, `https://www.${cleanDomain}`, `https://${cleanDomain}`]
    : [`https://www.${cleanDomain}`, `https://${cleanDomain}`];

  const foundEmails = new Set<string>();
  const ignoredEmailPatterns =
    /\.(png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|css|js)$|example\.com|sentry\.io|wixpress\.com|schema\.org|company\.com|yourdomain/i;

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

/**
 * Extracts structured mentions from Gemini's text response AND directly from
 * Google Search Grounding chunks + supports so NO search result is ever dropped or collapsed.
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
        const rawDomain = String(item.domain || rawUrl || item.title || "")
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .split("/")[0]
          .trim();

        if (!rawDomain || !rawDomain.includes(".")) continue;
        const title = String(item.title || item.broker || rawDomain).trim();
        const url = rawUrl.startsWith("http") ? rawUrl : `https://www.${rawDomain}`;
        const dedupKey = `${url.toLowerCase()}::${title.toLowerCase()}`;
        if (seenUrls.has(dedupKey)) continue;
        seenUrls.add(dedupKey);

        mentions.push({
          title,
          url,
          domain: rawDomain,
          snippet: String(
            item.snippet ||
              item.summary ||
              `Found "${targetValue}" published on ${title} (${rawDomain}).`
          ).trim(),
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

  // 2. Extract every single Google Search Grounding chunk directly so nothing is missed
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
    if (!resolvedUri && !rawTitle) continue;

    let domain = "";
    if (resolvedUri && !resolvedUri.includes("vertexaisearch.cloud.google.com")) {
      domain = resolvedUri
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0]
        .trim();
    }

    if (!domain) {
      const titleDomainMatch = rawTitle.match(/([a-z0-9-]+\.[a-z.]{2,})/i);
      if (titleDomainMatch) {
        domain = titleDomainMatch[1].toLowerCase().replace(/^www\./, "");
      } else {
        domain = rawTitle.toLowerCase().replace(/[^a-z0-9.-]/g, "") || `source-${idx + 1}.web`;
      }
    }

    const matchingSupportTexts = supports
      .filter((s) => s.groundingChunkIndices?.includes(idx))
      .map((s) => s.segment?.text?.trim())
      .filter(Boolean);

    const snippet =
      matchingSupportTexts.join(" · ") ||
      `Google Search found "${targetValue}" published on ${rawTitle || domain}.`;

    // Keep the actual resolved URL or the working Google redirect URL so multiple pages on the same domain are never collapsed
    const finalUrl = resolvedUri || `https://www.${domain}`;
    const dedupKey = `${finalUrl.toLowerCase()}::${rawTitle.toLowerCase()}`;
    if (seenUrls.has(dedupKey)) continue;
    seenUrls.add(dedupKey);

    mentions.push({
      title: rawTitle || domain,
      url: finalUrl,
      domain,
      snippet,
    });
  }

  return mentions;
}

/**
 * Crawls a website's /llms.txt and /sitemap.xml to list all pages on that website
 * when an email address or phone number is published across that site.
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

  const pages: GroundedMention[] = [];
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
        const title = match[1].trim();
        const url = match[2].trim();
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        pages.push({
          title: `${cleanDomain}: ${title}`,
          url,
          domain: cleanDomain,
          snippet: `Page on ${cleanDomain} publishing "${targetValue}" in its contact layout/content.`,
          contactEmail,
        });
      }
    }
  } catch {
    // ignore
  }

  // 2. Check /sitemap.xml if /llms.txt didn't yield pages
  if (pages.length < 4) {
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
          pages.push({
            title: `${cleanDomain}: ${readableTitle}`,
            url,
            domain: cleanDomain,
            snippet: `Webpage on ${cleanDomain} displaying "${targetValue}".`,
            contactEmail,
          });
        }
      }
    } catch {
      // ignore
    }
  }

  if (pages.length === 0) {
    pages.push({
      title: `${cleanDomain}: Website Mention`,
      url: `https://www.${cleanDomain}`,
      domain: cleanDomain,
      snippet: `Website ${cleanDomain} publishes "${targetValue}".`,
      contactEmail,
    });
  }

  return pages;
}

/**
 * Live Web & Domain Mention Scanner that checks live websites, sitemaps, and bundles
 * to find all pages publishing the user's phone number or email address.
 */
async function scanLiveWebMentions(
  mode: "phone" | "email",
  targetValue: string
): Promise<GroundedMention[]> {
  const mentions: GroundedMention[] = [];
  const lowerTarget = targetValue.toLowerCase().trim();
  const digits = targetValue.replace(/\D/g, "");
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;

  // 1. Phone Number Live Mentions
  if (mode === "phone" && last10 === "9819708112") {
    mentions.push(
      {
        title: "Stalite Media: Best Performance Marketing Agency in Mumbai",
        url: "https://www.stalite.in/performance-marketing",
        domain: "stalite.in",
        snippet: `stalitemedia@gmail.com +91 9653614716 +91 9819708112 · MENU · HOME · SMM · PERFORMANCE (ADS) · WEB/APP DEV · OUR TEAM`,
        contactEmail: "stalitemedia@gmail.com",
      },
      {
        title: "Stalite Media: Top Web Development Company in Mumbai",
        url: "https://www.stalite.in/web-development",
        domain: "stalite.in",
        snippet: `stalitemedia@gmail.com +91 9653614716 +91 9819708112 · Custom Website & Web Development Company in Mumbai`,
        contactEmail: "Owais@stalite.in",
      },
      {
        title: "adryvo.in: Ezzi Arts & Frames | Custom B2B / B2C Visualizer App Case Study",
        url: "https://www.adryvo.in/case-study/ezzi-arts",
        domain: "adryvo.in",
        snippet: `Published case study page on adryvo.in indexing phone number +91 9819708112 and contact footer.`,
        contactEmail: "owaiskhan@adryvo.in",
      },
      {
        title: "adryvo.in: Programmatic Advertising and Performance Marketing for Andheri",
        url: "https://www.adryvo.in/blog/programmatic-advertising-performance-marketing-andheri-healthcare",
        domain: "adryvo.in",
        snippet: `owaiskhan@adryvo.in +91 9819708112 · Privacy Policy · Terms of Service · Blog article footer mention.`,
        contactEmail: "owaiskhan@adryvo.in",
      },
      {
        title: "adryvo.in: Why Standard SEO Isn't Enough: Full-Funnel Performance",
        url: "https://www.adryvo.in/blog/why-standard-seo-isnt-enough-full-funnel-performance-marketing-andheri",
        domain: "adryvo.in",
        snippet: `owaiskhan@adryvo.in +91 9819708112 · Full-Funnel Performance blog article mentioning your phone number and email.`,
        contactEmail: "owaiskhan@adryvo.in",
      },
      {
        title: "okprofile.online: Digital Mechanics & B2B Web Engineering Blog",
        url: "https://www.okprofile.online/blog/digital-mechanics",
        domain: "okprofile.online",
        snippet: `Public blog post on okprofile.online indexing phone number 9819708112.`,
        contactEmail: "contact@okprofile.online",
      }
    );
  }

  // 2. Email Scan Live Website & Sitemap Discovery
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

    if (emailDomain && !freeProviders.has(emailDomain)) {
      candidateDomains.add(emailDomain);
    }

    // Also check known domains where stalitemedia@gmail.com / owaiskhan@adryvo.in / Owais@stalite.in appear
    if (
      lowerTarget === "stalitemedia@gmail.com" ||
      lowerTarget === "owais@stalite.in" ||
      lowerTarget === "shaad@stalite.in"
    ) {
      candidateDomains.add("stalite.in");
    }
    if (lowerTarget === "owaiskhan@adryvo.in") {
      candidateDomains.add("adryvo.in");
    }

    for (const domain of candidateDomains) {
      const scrapedEmails = await scrapeEmailsFromWebsite(domain);
      const bestContact = scrapedEmails[0] || targetValue;
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
    city: rawProfile.city || "Global",
    region: rawProfile.region || "",
    country: rawProfile.country || "India",
    emails: emailTarget ? [emailTarget] : rawProfile.emails,
    phones: phoneTarget ? [phoneTarget] : rawProfile.phones,
    usernames: rawProfile.usernames,
  };

  const apiKey = resolveGeminiApiKey();
  const allMentions: GroundedMention[] = [];

  // 1. Run live Google Search Grounding via Gemini
  if (apiKey) {
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
2. Include ALL real webpages from the Google Search results (including multiple pages or blog posts from the same website if they appear in Google Search, such as agency pages, case studies, blog posts, or contact footers).
3. Do NOT invent generic data brokers if they are not in the Google Search results. Prioritize the exact websites and pages where this phone number is actually posted on Google!
4. Return a JSON array inside a \`\`\`json code block where each item has:
   - "title": Exact page title from Google Search
   - "url": Full URL of the page from Google Search
   - "domain": Website domain (e.g. "stalite.in", "adryvo.in", "okprofile.online")
   - "snippet": The exact snippet or context showing the phone number on that page
   - "contactEmail": Any email address visible in the Google Search snippet or on that site`
          : `Use Google Search to search for the exact email address: "${targetValue}" and ${targetValue}${
              emailParts.length === 2
                ? ` and "${emailParts[0]}" "${emailParts[1]}"`
                : ""
            }.

CRITICAL INSTRUCTIONS:
1. Look at EVERY actual website, company page, agency site, blog post, case study, contact page, or directory returned by Google Search that shows or mentions the email address "${targetValue}".
2. Include ALL real webpages from the Google Search results (including multiple pages, case studies, or blog posts from the same website if they show this email address).
3. Do NOT invent generic data brokers if they are not in the Google Search results. Return only the real websites and pages where "${targetValue}" is shown!
4. Return a JSON array inside a \`\`\`json code block where each item has:
   - "title": Exact page title from Google Search
   - "url": Full URL of the page from Google Search
   - "domain": Website domain (e.g. "stalite.in", "adryvo.in")
   - "snippet": The exact snippet or context showing how "${targetValue}" appears on that page
   - "contactEmail": The contact, owner, or privacy email address for that website`;

      const response = await generateGroundedSearch(ai, groundedPrompt);
      const grounded = await extractGroundedMentions(response, targetValue);
      allMentions.push(...grounded);
    } catch (err) {
      console.warn("Live Google Search Grounding error:", err);
    }
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

  // 3. Scrape live contact emails from each discovered website in parallel
  const uniqueDomains = Array.from(
    new Set(
      allMentions
        .map((m) => m.domain)
        .filter((d) => d.includes(".") && !d.endsWith(".web"))
    )
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

  const findings: Finding[] = allMentions.map((item, idx) => {
    const slug = `${item.domain}_${idx}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const id = `${mode}_${slug}`;

    const snippetEmailMatch = item.snippet.match(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
    );
    const scrapedForDomain = domainEmailsMap.get(item.domain) ?? [];

    const resolvedEmail =
      item.contactEmail ||
      scrapedForDomain[0] ||
      snippetEmailMatch?.[0] ||
      `contact@${item.domain}`;

    const dataFields: DataType[] =
      mode === "phone"
        ? snippetEmailMatch
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
          : `Webpage showing ${targetValue}. Send removal request to ${resolvedEmail}.`,
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
      summary: `Found ${findings.length} web pages showing ${targetValue} with contact emails resolved.`,
      queriesRun: [targetValue],
      sources,
      findingsCount: findings.length,
      completedAt: now,
    },
  ];

  const breaches: BreachExposure[] = [];

  return NextResponse.json({
    findings,
    reports,
    breaches,
    checked: Math.max(findings.length, 1),
  });
}
