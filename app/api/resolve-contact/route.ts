import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  let domain = "";
  let url = "";
  try {
    const body = await request.json();
    domain = String(body.domain || "").trim();
    url = String(body.url || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cleanDomain = (domain || url)
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();

  if (!isValidPublicDomain(cleanDomain)) {
    return NextResponse.json({ contactEmail: null, emails: [] });
  }

  const foundEmails = new Set<string>();
  const ignoredPatterns =
    /\.(png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|css|js)$|example\.com|example\.org|example\.net|sentry\.io|wixpress\.com|schema\.org|company\.com|yourdomain/i;

  const extractEmails = (text: string) => {
    const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
    for (const raw of matches) {
      const clean = raw.trim().replace(/^[.,;]+|[.,;]+$/g, "");
      if (!ignoredPatterns.test(clean) && clean.length <= 64) {
        foundEmails.add(clean);
      }
    }
  };

  const targetUrl = url && url.startsWith("http") ? url : `https://www.${cleanDomain}`;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const html = await res.text();
      extractEmails(html);
    }
  } catch {
    // ignore
  }

  // If none found and we fetched a subpage, try the root homepage
  if (foundEmails.size === 0 && targetUrl !== `https://www.${cleanDomain}`) {
    try {
      const homeRes = await fetch(`https://www.${cleanDomain}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(2500),
      });
      if (homeRes.ok) {
        const homeHtml = await homeRes.text();
        extractEmails(homeHtml);
      }
    } catch {
      // ignore
    }
  }

  const emailList = Array.from(foundEmails);
  return NextResponse.json({
    contactEmail: emailList[0] || null,
    emails: emailList,
  });
}
