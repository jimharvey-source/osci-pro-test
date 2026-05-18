# OSCI Pro — Test Build (v2)

A technical test site for the OSCI Pro assessment. Clones the architecture of the live free OSCI (Vercel + static HTML + serverless function + pdfkit) and adds a landing page, About, Methodology, and Book pages plus a 50-item assessment grouped into ten subscale sections under two dimension banners.

**Not for public release.** Yellow test banner is on every page. All pages are `noindex,nofollow`.

## File structure

```
.
├── README.md                      ← this file
├── package.json                   ← pdfkit is the only dep
├── vercel.json                    ← noindex header
│
├── index.html                     ← landing page
├── about.html                     ← about the Pro tool
├── methodology.html               ← construct rationale and references
├── book.html                      ← link to the book
├── assessment.html                ← the questionnaire itself
│
├── assets/
│   ├── site.css                   ← shared styles for all pages
│   ├── chrome.js                  ← shared header/footer/test banner
│   ├── questionnaire.json         ← 50 items, reverse flags, shadow flags
│   └── scoring.js                 ← pure JS, runs in browser AND on server
│
└── api/
    └── generate-test-report.js    ← placeholder PDF generator
```

The shared header and footer are injected by `chrome.js` at runtime, so every page gets them without copy-paste. Edit the markup in one place when the header or footer changes.

## Deploying

The site is hosted on Vercel and deploys automatically from `main`. Edit, commit, push.

```bash
git add .
git commit -m "what changed"
git push
```

DNS routes `protest.opensourcecharisma.com` to this project via a Cloudflare CNAME record (grey cloud, DNS-only) pointing at `cname.vercel-dns.com`.

## House style

The voice across every page follows the project's voice rules. No em dashes. No antithesis constructions. UK English throughout. Plain Anglo-Saxon vocabulary. No corporate inflation. Examples before principles. Specific over elegant.

## What this test build is for

- Questionnaire delivery on desktop and mobile
- Client-side and server-side scoring agree on the same answers
- The scoring spec produces sensible results across realistic profiles
- The Authenticity Index correctly picks up the diagnostic signal the free tool cannot see
- PDF generation works under cold-start and warm conditions
- The marketing wrapper is structurally sound and ready for the launch copy pass

## What this test build is not

- It does not include Stripe payment integration
- It does not submit to Mailchimp
- It does not fire GA4 events
- The PDF is a placeholder, not the real practice report
- The Amazon link on the book page is a placeholder

All of these are next-phase work, once the test build has been validated with real respondents.
