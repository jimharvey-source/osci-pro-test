# OSCI Pro — Deploy Manifest (corrected to match local repo tree)
Repo: users/admin/OSCI_PRO-test_files  ·  GitHub: jimharvey-source/osci-pro-test  ·  branch: main
Build: content.json v3.3 · generate-report.js v3

## Push these TWO files (overwrite in place)

| Bundle file | Copy to (in your repo) | Replaces |
|---|---|---|
| assets/content.json | OSCI_PRO-test_files/assets/content.json | the 78 KB / 28 May version → now 138 KB |
| api/generate-report.js | OSCI_PRO-test_files/api/generate-report.js | the 64 KB / 28 May version |

That is the whole deploy. Two files.

## Do NOT push (already correct in your repo)
- assets/quadrant.png — byte-identical to what's already there (36 KB). Leave it.
- assets/questionnaire.json, assets/scoring.js, assessment.html — UNCHANGED since the
  v9.1 deploy that already shipped them. No edit this session. Skip.

## Why content.json grew (78 KB → 138 KB)
This is expected, not a mistake. It now carries the four preface pages and the locked
Charismatic Consistency page that were previously not in the file. It also has the
four softened quadrant blocks and the removed redundant consistency_bands.

## After the push
1. Commit + push both files to main. Vercel auto-builds (~1 min).
2. Generate ONE Pro report on the live site so api/generate-report actually runs.
3. Tell Claude — Claude pulls the api/generate-report runtime logs to read the
   headline 400 (verbose logging is in place; the reason should now appear).

## Reminder
Cloudflare stays DNS-only (grey cloud). Nothing to change there.
