# Untrace

Find every trace of your personal data online, then ask each owner to delete it.

**Live:** [untrace.justsimpleapps.online](https://untrace.justsimpleapps.online)

Untrace scans the people-search directories, marketing databases, ad-tech profiles
and archives that publish your name, address and phone number. It ranks what it
finds, then writes a deletion request to each company, citing the privacy law of
your country and naming the exact fields they hold. You review every message and
send it from your own mailbox.

## The flow

1. **Scan.** Enter a name and a city. Emails, phone numbers and usernames are
   optional and make the report sharper. 45 real sources are checked.
2. **Report.** Every listing is grouped by category and scored by risk, with the
   data it exposes and the owner's official opt-out page.
3. **Request.** One click writes a deletion email for that company: the fields to
   remove, the legal basis (CCPA/CPRA, GDPR Article 17, DPDP, PIPEDA, Privacy Act),
   a deadline and an escalation path. Edit it, copy it, open it in your mail app,
   or use the company's opt-out form.
4. **Track.** Drafted, sent, confirmed, removed or refused. Each request gets a
   30-day follow-up clock and a ready-made reminder.

Breaches are handled honestly: a leaked password list cannot be deleted, so
Untrace tells you what to rotate instead.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run typecheck
```

Node 18.18 or newer.

## What is real, what is modelled

Real: the 45-source directory and its opt-out links, the legal templates, the
risk model, the request lifecycle, the CSV export and the scan endpoint.

Modelled: the per-person listings. `lib/scan.ts` seeds a deterministic matching
model from your profile and the coverage figures in `lib/brokers.ts`, so the same
person always gets the same report. It demonstrates the whole product before a
live data provider is connected. To go live, replace the body of `runScan()` with
a provider or crawler call and return the same `ScanResult` shape. Nothing else
changes.

Broker opt-out pages and privacy mailboxes move occasionally. The UI always shows
the destination, and every contact field is editable before you send.

## Built with

Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4 and Lucide icons.
Fonts are self-hosted. There is no database, no account and no analytics.

The report and request history live in your browser's `localStorage` under
`untrace.state.v1`. The scan endpoint computes a result and returns it; nothing is
persisted server side.

## Design

Flat surfaces, hairline borders, a paper palette (`#FAFAF7`, `#1C1E1A`, one moss
accent) and generous space. No gradients anywhere. All text meets WCAG AA.

## License

[GNU Affero General Public License v3.0 or later](LICENSE).

Copyright (C) 2026 Owais Khan.

This licence is deliberately strong. If you host a modified copy of Untrace,
section 13 requires you to offer its source to the people using it. A privacy
tool should not be able to go quiet.

## Disclaimer

Untrace is an independent project, not legal advice. Opt-out links point to the
companies' own pages. If a company refuses a valid request, a privacy lawyer or
your data protection authority is the next step.
