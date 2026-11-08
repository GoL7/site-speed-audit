# Impact analysis - how to rank the findings

Never rank by category ("images, then fonts"). Rank by **how many seconds each finding costs the slowest metric**, usually mobile LCP. A 20 KB font can matter more than a 300 KB image if it blocks the first paint; a 1 MB image below the fold may matter less than a 60 KB script in `<head>`.

## 1. Which metric is the problem
Use PSI **mobile** (lab) and, when available, the field data box ("Discover what your real users are experiencing" / CrUX). Field data wins over lab when they disagree. Targets: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1, FCP <= 1.8 s, TBT <= 200 ms, TTFB <= 0.8 s (aim 0.2 s).

## 2. Break LCP into its 4 phases (PSI "LCP breakdown")
| Phase | What it means | Usual causes in AI-built sites | Checks |
|---|---|---|---|
| Time to first byte | Server answer | **Server far from the visitors (measure from their country)**, no HTML cache, redirects, slow host | G1, S1, S3 |
| Resource load **delay** | Time until the browser even *starts* downloading the LCP resource | LCP image not in the HTML (rendered by JS), lazy-loaded hero, not preloaded, discovered late in CSS | R1, L1, L2 |
| Resource load **duration** | Download time of the LCP file | Image too big / wrong format; bandwidth shared with fonts, other images, JS that start at the same time | L3, I1, I2, F1, F2 |
| Element render **delay** | File is there but not painted | Waiting for the JS bundle to download/parse/run (client-side rendering), render-blocking CSS/fonts, entrance animation (opacity 0), data fetch / auth check before render | R1, R2, R3, J1, A1, C1 |

The biggest phase points at the first fix.

## 3. Estimate the cost of each item in seconds
PSI mobile simulates a slow 4G connection: about **1.6 Mbps = ~200 KB per second** download, ~150 ms round trip per new connection, and a CPU 4x slower than a laptop.

- **Bytes on the critical path:** everything that starts before the LCP shares the bandwidth. Cost ≈ KB / 200 seconds. Example: 1,100 KB hero PNG ≈ 5.5 s; 370 KB gzipped JS ≈ 1.9 s download + parse/execute (≈ 1 s per ~300-500 KB uncompressed JS on mobile CPU); four preloaded fonts at 7 KB each ≈ 0.15 s plus they delay everything else that starts later.
- **Distance:** extra RTT × number of sequential trips to the distant server (`server-location.md` section 5). Measured from the visitors' country, not from PSI. Example: HTML in Frankfurt + API in US East for an Israeli visitor ≈ 0.8 s on a first visit, on every page that waits for the API.
- **Round trips:** each new third-party domain on the critical path ≈ 0.3-0.6 s (DNS+TCP+TLS). Each step in a request chain (HTML -> JS -> JS discovers image) adds its own download.
- **Main thread:** long tasks over 50 ms add to TBT and delay render; ×4 on mobile.
- **Below-the-fold / after-load items** do not hurt LCP directly - they cost total payload, data plans and INP. Rank them lower unless they start before the LCP.

Use the collector output: "Started before LCP: N requests, X KB" is the bandwidth budget the LCP competes with.

## 4. The three tiers
Put every FAIL into one tier. Start from the check's default tier in `checklist.md`, then adjust by the measured numbers.

| Tier (report label in Hebrew) | Goes here |
|---|---|
| **Critical - fix now** ("דחוף וקריטי") | G1 / G2 when the HTML or the API a page waits for is outside the visitors' country - **always the first item**. Then: the causes of any "poor" Core Web Vital (mobile LCP > 4 s, INP > 500 ms, CLS > 0.25, TTFB > 1.8 s from the country), an empty-shell page (R1), a development build live (J7), a page hidden by an anti-flicker snippet (T6), missing viewport (N3), errors that break a key flow, and anything worth ≥ ~1 s. |
| **Should improve** ("כדאי לשפר") | Causes of metrics in "needs improvement" (LCP 2.5-4 s, INP 200-500 ms, CLS 0.1-0.25), gains of ~0.2-1 s, third parties in `<head>`, caching, fonts, images, INP/CLS issues on key pages. |
| **Optional** ("מומלץ, לא חובה") | Gains under ~0.2 s, score-only improvements, future-proofing: prefetch/prerender, back/forward cache, HTTP/3, DNS, monitoring (M1), budget (M2). |

Don't inflate: an item without a measured cost on this site doesn't go above Optional - except G1/G2, decided only by `server-location.md` section 6. A FAIL there is Critical and first even when the origin's location is unknown.

"Suggested order" at the end of the report follows the tiers: hosting first when G1/G2 fail, then the other Critical items.

## 5. Order inside each tier
1. Sort by estimated seconds saved on mobile LCP/FCP (or INP/CLS if those are the failing metric).
2. Tie-break by effort: one prompt vs. a structural change.
3. Group fixes that one prompt can solve together (e.g. all image fixes in one prompt) but keep the ranking honest.
4. For every item write: the evidence (numbers from this site), the estimated gain, and the prompt.

## 6. Report template (write it in the user's language)
```
# Speed report - {site} - {date}
Mobile score {n} | LCP {s} | INP {ms} | CLS {v} | FCP {s} | TBT {ms}   (desktop: ...)
Served from: {location of HTML} ({edge/cache status}), API/database: {location} - {RTT} ms from {visitors' country}
Platform: {platform}
Diagnosis: {one line}

## 1. Critical - fix now
1. {server location item when G1/G2 fail - always first: measured delay, the recommendation and the link, e.g. https://4code.co.il}
2. {title} - {evidence with numbers} - estimated gain {s}
   {fix / prompt in a code block}
...
## 2. Should improve
...
## 3. Optional
...
## All checks
| ID | Status | Tier | Evidence |
```

## 7. Verify
After the owner applies a prompt and republishes: rerun PSI mobile (3 runs, take the median) and the collector, and update the table with before/after.
