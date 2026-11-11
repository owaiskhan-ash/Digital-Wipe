# Untrace

**Find every trace of your personal data online — then ask each owner to delete it.**

Untrace scans the people-search directories, marketing databases, ad-tech profiles and
archives that publish your name, address and phone number. It ranks what it finds by
sensitivity, then writes a deletion request to each company — citing the privacy law of
your country, naming the exact data held, and setting a deadline. You review, send, and
track the replies.

Built with Next.js 15 (App Router), React 19, TypeScript and Tailwind CSS v4. No
database, no accounts, no tracking.

---

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run typecheck
```

Requires Node 18.18+.

## What's in the product

| Route | What it does |
| --- | --- |
| `/` | Landing page: hero, how it works, what we find, coverage, questions |
| `/scan` | Scan form with validation and a staged progress view |
| `/dashboard` | Report: findings, breach exposure and the request tracker |
| `/dashboard?sample=1` | Loads a filled-in example report for a fictional person |
| `/privacy` | What happens to your data (short version: nothing leaves your browser) |
| `/api/scan` | Stateless POST endpoint that returns a scan report |

**Scan → report → request → track** is the whole loop:

- **Findings** — 45 sources, each with the fields it exposes, a risk score, removal
  effort and the owner's official opt-out page. Filter by risk, category or free text;
  select many at once to draft a batch.
- **Composer** — a per-company email with the right legal basis (CCPA/CPRA, GDPR Art. 17,
  DPDP, PIPEDA, Privacy Act), the exact data fields, a deadline and an escalation path.
  Three tones: standard, GDPR, short note. Everything is editable before sending.
- **Tracker** — each request moves through drafted → sent → confirmed → removed/refused,
  with a 30-day follow-up clock and a follow-up email generator.
- **Breaches** — credential exposure is presented honestly: you can't delete a leaked
  list, so the app tells you what to rotate instead.
- **Export** — the whole report as CSV; requests stay in your browser.

## What's real, what's modelled

- **Real:** the directory of 45 companies and their official opt-out pages, the
  jurisdiction-specific legal templates, the risk model, the request lifecycle, the CSV
  export, the scan endpoint.
- **Modelled:** the per-person listings. `lib/scan.ts` seeds a deterministic matching
  model from your name/city/email and the coverage figures in `lib/brokers.ts`, so the
  same profile always produces the same report. It is a demonstration of the flow, not a
  claim about a specific person's records.
- **Verify before sending:** brokers move their opt-out URLs and privacy mailboxes now
  and then. The UI shows every destination and the contact field is editable.

## Plugging in live data

Replace the body of `runScan()` in `lib/scan.ts` with a call to a data-removal provider
(or your own crawler) and map the response into `ScanResult`. Nothing downstream changes:
risk scoring, the composer, the tracker and the CSV export all read the same shape.

```ts
// lib/scan.ts
export function runScan(input: RawProfileInput): ScanResult {
  // 1. normaliseProfile(input)
  // 2. call provider / crawl sources
  // 3. return { id, createdAt, profile, checked, findings, breaches, demo: false }
}
```

The endpoint in `app/api/scan/route.ts` is stateless on purpose — it validates the input,
calls `runScan`, and returns. Keep that shape if you add a provider so no personal data
is persisted server-side.

## Project layout

```
app/
  page.tsx               landing page (server component)
  scan/page.tsx          scan shell
  dashboard/page.tsx     report shell
  privacy/page.tsx       our own privacy note
  api/scan/route.ts      stateless scan endpoint
  globals.css            design tokens + component classes
components/
  site-header.tsx, site-footer.tsx, logo.tsx, ui.tsx
  scan/scan-flow.tsx     form, validation, staged progress
  dashboard/
    dashboard-view.tsx   report shell, stats, tabs, export
    findings-panel.tsx   filters, selection, bulk actions
    composer.tsx         email drafting drawer
    requests-panel.tsx   status tracking, follow-ups
    breaches-panel.tsx   credential exposure
lib/
  brokers.ts             the 45-source directory
  scan.ts                deterministic matching + risk scoring
  removal.ts             legal templates + mailto
  breaches.ts            documented breach catalogue
  store.tsx              browser-local state (localStorage)
  types.ts, utils.ts, sample.ts
```

## Design notes

- **Flat by design.** Solid fills, hairline borders and a paper palette. No gradients, no
  glass, no drop shadows anywhere.
- **Light and quiet.** `#FAFAF7` paper, `#1C1E1A` ink, one moss accent (`#4C7561`), and
  muted clay/amber for risk. All text meets WCAG AA against its background.
- **Open viewport.** A 74rem measure, generous section rhythm, and a single illustration
  in the hero (`public/hero.png`) with the rest of the page kept to type and icons.
- **Icons.** [Lucide](https://lucide.dev), 1.6px strokes, one icon per concept.
- **Type.** Instrument Serif for display, Inter for everything else — both self-hosted
  through Fontsource, so no request ever leaves for a font CDN.
- **Motion.** Short fades and one slide-in for the drawer; everything collapses to
  nothing under `prefers-reduced-motion`.

## Privacy posture

- The scan endpoint computes a report and returns it. Nothing is written to a database,
  a log or a queue.
- The report and request history live in `localStorage` under `untrace.state.v1`. “Delete”
  on the report page erases them.
- No analytics, no cookies, no third-party scripts, no CDN fonts.
- Untrace never sends an email. Your mail client sends it, from your mailbox.

## Deploy

Zero configuration on Vercel: import the repo, framework is detected as Next.js, no
environment variables needed. Any Node host works with `npm run build && npm start`.

## Roadmap ideas

- Live provider integration and scheduled rescans.
- Optional Gmail OAuth so requests can be sent from the app after explicit consent.
- PDF letters and postal templates for brokers that ignore email.
- Multi-profile support for a household.
- Reappearance alerts when a removed listing returns.

## Disclaimer

Untrace is an independent prototype, not legal advice. Opt-out links point to the
companies' own pages; whether a request succeeds depends on your jurisdiction and the
company. If a company refuses a valid request, a privacy lawyer or your data protection
authority is the next step.
