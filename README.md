# OSCI Pro — Test Build

A technical test site for the OSCI Pro assessment. Clones the architecture of the live free OSCI (Vercel + static HTML + serverless functions + pdfkit) and extends it for the 50-item Pro instrument.

**Purpose:** prove the full pipeline end-to-end before any practice content is wired in. Questionnaire delivery, client-side scoring, server-side scoring, PDF generation, download flow. Real numbers, placeholder narrative.

**Not for users yet.** No payment integration, no analytics, no real PDFs. The whole site is `noindex,nofollow` and lives at a non-public URL.

## What's in here

```
.
├── README.md                      ← this file
├── package.json                   ← pdfkit is the only dep
├── vercel.json                    ← noindex header
├── index.html                     ← the assessment, single file
├── assets/
│   ├── questionnaire.json         ← 50 items, reverse flags, shadow flags
│   └── scoring.js                 ← pure JS, runs in browser AND on server
├── api/
│   └── generate-test-report.js    ← placeholder PDF generator (no Stripe)
└── test_pdf.js                    ← local pipeline test, not deployed
```

## Local development

```bash
cd osci-pro-test
npm install
npx vercel dev
```

That gives you the site at `http://localhost:3000`. The serverless function at `/api/generate-test-report` runs locally too.

To test the scoring + PDF pipeline without the browser:

```bash
node test_pdf.js
# writes /tmp/test_output.pdf
```

## Deploying to opensourcecharisma.com/pro-test

This is a separate Vercel project sitting next to the existing CQCI-Assessment project. It does not touch the live free tool.

### One-time setup

1. **Create a new GitHub repo.** Suggested name: `osci-pro-test`. Push this folder to it.

2. **Create a new Vercel project.** Import the GitHub repo. Use default settings (no framework preset needed — it's a static site with a serverless function).

3. **Add a domain alias.** In the new Vercel project → Settings → Domains, add:
   `opensourcecharisma.com/pro-test`
   Vercel will treat this as a subpath alias and route requests to it. Because the apex is already configured on the existing `cqci-assessment` project, the subpath needs to be set up using **Vercel rewrites on the existing project**, not as a new domain — see "Routing the subpath" below.

### Routing the subpath (the actual question to resolve)

The existing free tool owns `opensourcecharisma.com`. We need `/pro-test` to route to the new project. Two ways to do this:

**Option A (cleanest): use a subdomain instead.**
- Set up `protest.opensourcecharisma.com` as a CNAME → `cname.vercel-dns.com` in Cloudflare (DNS-only / grey cloud).
- Add `protest.opensourcecharisma.com` as a domain on the new Vercel project.
- One-line redirect in the existing project's `vercel.json` if we want `/pro-test` → `protest.opensourcecharisma.com`.

This is the option I recommend. It mirrors how the free tool sits at `/assessment`, keeps the two projects properly isolated, and avoids the rewrite headaches that come with cross-project subpaths.

**Option B: rewrite from the existing project.**
- Edit the existing `cqci-assessment` repo's `vercel.json` and add:
  ```json
  {
    "rewrites": [
      { "source": "/pro-test/:path*", "destination": "https://osci-pro-test.vercel.app/:path*" }
    ]
  }
  ```
- Push. Vercel redeploys the live free tool with the new rewrite rule.

Less clean (the live free tool now has a rewrite that depends on the test project's Vercel URL), but keeps everything under the apex domain. **My recommendation: Option A unless there's a reason to keep it on the apex.**

### Deploy

Once routing is decided:

```bash
cd osci-pro-test
git add .
git commit -m "Initial test build"
git push
# Vercel auto-deploys in ~30 seconds
```

Verify by visiting the URL. The yellow test banner at the top should be visible. Walk through the questionnaire end-to-end. Click "Generate test PDF" on the results screen. PDF should download with your scores in it.

### Switching from local to production

Nothing to switch. The test build has no environment variables, no Stripe keys, no Mailchimp action URL. It runs identically locally and on Vercel.

## Voice and content notes

- The intro copy is deliberately plain and matches the project's house style. No em dashes, no antithesis constructions, UK English. Edit `index.html` directly if you want to change the framing.
- The questionnaire items are taken verbatim from `OSCI_Pro_Competency_Framework_v3.docx` §11. If items change in the framework, update `assets/questionnaire.json` to match. The two are the canonical pair.
- Subscale names use ampersands rather than "and" to match the framework formatting.

## What this proves and what it does not

**Proves:**
- Questionnaire delivery scales to 50 items on desktop and mobile
- Client-side scoring matches server-side scoring (same `scoring.js` runs in both places)
- The framework's scoring spec produces sensible results across realistic profiles
- PDF generation works under cold-start conditions (~2-3s) and warm conditions (<200ms)
- The Authenticity Index correctly picks up the diagnostic signal that the free tool misses

**Does not prove:**
- Stripe Checkout integration (not wired up)
- Mailchimp list submission (not wired up)
- GA4 event tracking (not wired up)
- The personalisation engine (next workstream)
- The real Pro report content (next workstream)

## Next steps once this is live

1. Walk through it five or six times with deliberately different answer profiles. Confirm the band placements look right.
2. Send the URL to two or three trusted people for usability feedback on the questionnaire flow.
3. Start the personalisation engine workstream: the mapping table from `(quadrant × band × two priority subscales) → report content slabs`.
4. Once the personalisation engine has a working table, replace `generate-test-report.js` with `generate-report.js` (the real one) and add Stripe.
