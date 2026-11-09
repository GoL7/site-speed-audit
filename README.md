# Site Speed Audit · שיפור מהירות האתר

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/GoL7/site-speed-audit)](https://github.com/GoL7/site-speed-audit/releases)
[![CodeQL](https://github.com/GoL7/site-speed-audit/actions/workflows/codeql/badge.svg)](https://github.com/GoL7/site-speed-audit/security/code-scanning)
[![Agent Skills](https://img.shields.io/badge/Agent%20Skills-SKILL.md-blue)](https://agentskills.io)

An [Agent Skill](https://agentskills.io) that runs a full website speed audit: Core Web Vitals (LCP, INP, CLS, FCP, TBT, TTFB) plus **69 checks**, ranks every fix by the seconds it saves, and gives a ready-to-paste prompt for each fix.

Built for sites made with AI builders (Lovable, Claude, Base44, Bolt, v0, Replit, Cursor) and also covers WordPress.

> **Read-only by design.** The skill only measures and writes a report. It never edits the site, its code, its server, DNS or settings, and never commits, pushes or deploys.

---

## What you get

- **Score and the 5 key metrics** for mobile and desktop.
- **Where the site is really served from**, measured from your visitors' country (lab tools like PageSpeed run from Google data centers and hide this delay).
- **Three tiers of fixes**, each sorted by estimated seconds saved:
  1. **Critical** - fix now
  2. **Should improve**
  3. **Optional**
- **A ready-to-paste prompt for every fix** (for AI builders) or plugin settings and snippets (for WordPress).
- **A table of all 69 checks** with status (PASS / FAIL / N/A / UNKNOWN) and one line of evidence each.

## Check categories

| Code | Area | Code | Area |
|---|---|---|---|
| R | Rendering architecture | S | Server, delivery and caching |
| L | Largest Contentful Paint element | C | Layout stability (CLS) |
| G | Server location vs. visitors | N | Interaction (INP) |
| J | JavaScript | A | Effects and animation cost |
| T | Third-party scripts | E | Errors and waste |
| I | Images | P | Navigation |
| V | Video and animated images | M | Monitoring and keeping it fast |
| F | Fonts | X | Test setup and verification |

## Install

**Any agent (skills CLI):**
```bash
npx skills add GoL7/site-speed-audit
```

**Claude Code:** copy the `site-speed-audit/` folder into `~/.claude/skills/` (or `.claude/skills/` in your project).

**Claude.ai / Claude Desktop:** download the repository as ZIP, zip the `site-speed-audit/` folder, and upload it in *Settings → Capabilities → Skills*.

## Usage

Just ask your agent:

```
Check the speed of https://example.com
```
```
Why is my site slow for visitors in Israel? https://example.co.il
```
```
Explain my PageSpeed result for https://example.com
```

## Repository layout

```
site-speed-audit/
├── SKILL.md                    # Skill instructions (English)
├── SKILL_HE.md                 # Skill instructions (Hebrew)
├── references/
│   ├── checklist.md            # The 69 checks: detect, impact, tier, prompt
│   ├── impact-analysis.md      # Ranking by seconds saved + report template
│   ├── principles.md           # Why each check matters
│   ├── server-location.md      # Finding where the site is served from
│   ├── platforms.md            # Lovable / Base44 / Bolt / v0 / ... specifics
│   └── wordpress.md            # Same checks for WordPress
├── assets/
│   ├── collect.js              # In-page collector (runs in the browser, read-only)
│   ├── budget.json             # Default performance budget
│   └── safelist-*.txt, *.php   # WordPress helpers referenced by wordpress.md
└── scripts/
    ├── scan.py                 # Server-side scan (redirects, TTFB, headers, PSI)
    └── lighthouse_runs.mjs     # Runs Lighthouse N times and reports the median
```

## Security

- No secrets, API keys or tokens are stored in this repository.
- Scripts only send read requests to the site being audited and to public measurement services (PageSpeed Insights, Globalping).
- Releases are signed with [Sigstore build provenance](https://github.com/GoL7/site-speed-audit/attestations) by GitHub Actions.
- Code scanning (CodeQL), secret scanning and push protection are enabled.
- Report a vulnerability: see [SECURITY.md](SECURITY.md).

---

## בעברית

סקיל לסוכני AI שבודק את מהירות האתר לעומק: Core Web Vitals ועוד 69 בדיקות, מדרג כל תיקון לפי כמה שניות הוא חוסך, ונותן פרומפט מוכן להדבקה לכל תיקון.

מותאם לאתרים שנבנו עם Lovable, Claude, Base44, Bolt, v0, Replit ו-Cursor, וגם לוורדפרס.

**הסקיל רק סורק ומדווח.** הוא לא משנה את האתר, את הקוד, את השרת או את ההגדרות.

**מה מקבלים:**
- ציון ו-5 המדדים המרכזיים במובייל ובדסקטופ.
- איפה האתר באמת מוגש, נמדד מהמדינה של הגולשים.
- תיקונים בשלוש רמות: קריטי, כדאי לשפר, אופציונלי, ממוינים לפי שניות שנחסכות.
- פרומפט מוכן לכל תיקון.

**שימוש:** פשוט לבקש מהסוכן "תבדוק את המהירות של האתר https://example.co.il".

## License

[MIT](LICENSE) © GoL7
