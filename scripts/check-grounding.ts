// Checks that a page the search found is not thrown away on the way in.
// Run: npx tsx scripts/check-grounding.ts   (or: node --experimental-strip-types --experimental-resolve-... )
import {
  normaliseUrl,
  domainFromTitle,
  shapeModelItems,
  parseJsonArrayLoose,
  isValidPublicDomain,
} from "../lib/grounding.ts";

let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass += 1;
  else fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

// --- URL normalisation -------------------------------------------------------
const urlCases: Array<[string, string | null]> = [
  ["https://lbb.in/mumbai/shops/", "https://lbb.in/mumbai/shops/"],
  ["http://example.net/a?b=1", "http://example.net/a?b=1"],
  ["lbb.in", "https://lbb.in"],
  ["lbb.in/mumbai/shops/", "https://lbb.in/mumbai/shops/"],
  ["www.stalite.in", "https://www.stalite.in"],
  ["sub.domain.co.uk/path", "https://sub.domain.co.uk/path"],
  ["https://site.com/page).", "https://site.com/page"],
  ["  <https://site.com/x>  ", "https://site.com/x"],
  ['"https://site.com/y"', "https://site.com/y"],
  ["not a url", null],
  ["", null],
  ["see lbb.in for details", null],
];
for (const [input, expected] of urlCases) {
  const got = normaliseUrl(input);
  check(`normaliseUrl(${JSON.stringify(input)})`, got === expected, `got ${JSON.stringify(got)}`);
}

// --- Title domains ----------------------------------------------------------
check("title domain: name then domain", domainFromTitle("Best Agency in Mumbai | ROI Digital") === "");
check("title domain from title", domainFromTitle("Gizmoz — lbb.in") === "lbb.in");
check("title domain skips google", domainFromTitle("Google Search - google.com") === "");
check(
  "title domain picks the real site",
  domainFromTitle("Result on gpt.stalite.in / google.com") === "gpt.stalite.in"
);

// --- Shaping ----------------------------------------------------------------
const target = "9819708112";
const items = [
  { title: "LBB Mumbai", url: "https://lbb.in/mumbai/shops/", snippet: "Call (+919819708112)." },
  { title: "Stalite", url: "stalite.in/", snippet: "Contact 9819708112." },
  { title: "GPT Stalite", url: "www.gpt.stalite.in", snippet: "Footer." },
  { title: "Bare host", url: "imagine-taupe.vercel.app", snippet: "" },
  { title: "Redirect that resolved", url: "https://vertexaisearch.cloud.google.com/x", snippet: "" },
  { title: "Redirect that did not", url: "https://vertexaisearch.cloud.google.com/y", snippet: "no domain in the title" },
  { title: "Contact — aghajani.co.in", url: "https://vertexaisearch.cloud.google.com/z", snippet: "" },
  { title: "Duplicate of LBB", url: "https://lbb.in/mumbai/shops/", snippet: "same page" },
  { title: "Junk", url: "see the footer", snippet: "" },
  { title: "Fake domain", url: "https://example.com/x", snippet: "" },
  { title: "Search engine", url: "https://www.google.com/search?q=9819708112", snippet: "" },
];
const resolved = [
  "https://lbb.in/mumbai/shops/",
  "https://stalite.in/",
  "https://www.gpt.stalite.in",
  "https://imagine-taupe.vercel.app",
  "https://imaginetaupe.in/portfolio", // redirect resolved to the real page
  "https://vertexaisearch.cloud.google.com/y", // never resolved
  "https://vertexaisearch.cloud.google.com/z", // never resolved, but title names a site
  "https://lbb.in/mumbai/shops/",
  "see the footer",
  "https://example.com/x",
  "https://www.google.com/search?q=9819708112",
];

const { mentions, dropped } = shapeModelItems(items, resolved, target);
const domains = mentions.map((m) => m.domain);
console.log("kept:", mentions.length, "dropped:", JSON.stringify(dropped));
console.log("domains:", domains.join(", "));

check("bare host kept", domains.includes("stalite.in"));
check("www without scheme kept", domains.includes("gpt.stalite.in"));
check("resolved redirect kept", domains.includes("imaginetaupe.in"));
check("unresolved redirect kept via title domain", domains.includes("aghajani.co.in"), domains.join(","));
check("duplicate url kept once", domains.filter((d) => d === "lbb.in").length === 1);
check("junk url dropped", dropped.noUrl === 1, `noUrl=${dropped.noUrl}`);
// fake domain + search engine are shaped the same way: rejected domain, no title domain
// 2 unresolvable redirects with no domain in the title, 1 fake domain, 1 search engine
check("rows with no usable page counted", dropped.unresolved === 3, `unresolved=${dropped.unresolved}`);
check("duplicate counted", dropped.duplicate === 1, `duplicate=${dropped.duplicate}`);
check("total dropped", dropped.total === 5, `total=${dropped.total}`);
check("every kept page shown", mentions.length === 6, `${mentions.length}`);
check(
  "every shown row has a real domain",
  mentions.every((m) => isValidPublicDomain(m.domain)),
  mentions.map((m) => m.domain).join(",")
);

// --- Truncated reply --------------------------------------------------------
const truncated =
  '[{"title":"A","url":"https://agency-mumbai.in/p","snippet":"s"},{"title":"B","url":"lbb.in/x","snippet":"s"},{"title":"cut';
const parsed = parseJsonArrayLoose(truncated);
check("truncated reply keeps whole rows", parsed.length === 2, `${parsed.length}`);
const shaped2 = shapeModelItems(parsed, ["https://agency-mumbai.in/p", "https://lbb.in/x"], target);
check("truncated rows all shown", shaped2.mentions.length === 2, `${shaped2.mentions.length}`);

// --- Report -----------------------------------------------------------------
console.log(`\n${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log("  FAIL", f);
process.exit(fails.length ? 1 : 0);
