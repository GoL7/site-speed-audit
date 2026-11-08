# Principles - why each check matters

The reasoning behind every check, each ending with the check IDs in `checklist.md` that apply it. Use it to explain findings to the owner and to judge cases the checklist doesn't spell out.

---

## 1. Core Web Vitals and how to read them
- **LCP (Largest Contentful Paint)** - when the biggest visible element (usually the top image, sometimes a heading) is painted. Target <= 2.5 s. It is the metric most affected by images, render-blocking files and JS-rendered pages. -> L1-L4, R1-R3
- **CLS (Cumulative Layout Shift)** - how much content jumps while loading without user action. Target <= 0.1. Causes: images/embeds without dimensions, content injected above existing content, late fonts, CSS that arrives late and restyles the page (critical-CSS/async-CSS tricks that cause a flash of unstyled content). -> C1, C2
- **FID -> INP, and TBT** - FID measured the delay of the first interaction; Google replaced it with INP (every interaction). In the lab, TBT stands in for it: time the main thread is blocked by long tasks (>50 ms). The cause is JavaScript that must download, parse and execute. -> J1-J5, N1, T1
- **FCP / Speed Index** - first content and how fast the page fills. Hurt by anything before the first paint: render-blocking CSS/fonts, scripts in <head>, empty JS-rendered HTML. -> R1, F2, T1, E2
- **TTFB** - time until the server answers; Google's guidance under 200 ms. -> S1
- **Lab vs field data.** PSI/GTmetrix are lab tests with fixed device/network. Field data (CrUX, "real users" box in PSI, Search Console) is real visitors, reported at the 75th percentile. They can disagree; field data is what Google uses. A site can score well in the lab and still be slow for real users (e.g. uncached URLs with fbclid). On low-traffic sites the owner's own logged-in visits pollute the field data. -> X1, S5
- **Score vs speed.** Some fixes only raise the score (e.g. merging files on HTTP/2), others make it faster for people. Prioritize real speed, then score.

## 1a. Distance - the cost no code fix removes
- Data travels at a fixed speed, so every round trip to a server costs at least its distance: a few ms inside the country, ~50-70 ms from Israel to Western Europe, ~130-160 ms to the US East Coast, ~200+ ms to the West Coast. -> G1
- A new HTTPS connection needs about 3 round trips before the first byte (TCP, TLS 1.3, request). Every later request to that server needs at least one more. Client-rendered apps chain them: HTML -> JS -> auth -> data -> image. -> G1, G2, R1, R2
- Smaller files reduce download time, not round trips. After the images, fonts and code are optimized, distance is what's left - so check it first, otherwise the optimizations hit a floor the owner can't explain. -> G1
- A CDN helps only for what it actually serves from a data center near the visitor: cached static files, and HTML only if HTML caching is on (`cf-cache-status: HIT`). When the HTML or the API comes from the origin, the visitor still waits for the origin's distance. -> G1, S1
- Lab tests (PSI, most Lighthouse services) run from Google/US/EU data centers, so they don't show this cost for visitors in another country. Measure from the visitors' country. -> G1, X1
- The backend counts too: a page that waits for a database in another continent pays that distance on every visit and every action. -> G2

## 2. The browser's critical path
- Nothing is free: every request costs bandwidth, every new domain costs DNS + TCP + TLS (~100-500 ms each), every script costs download + parse + execute. Goal: fewer requests, smaller files, fewer domains, less JS - especially before the first paint.
- What starts before the LCP shares the bandwidth with the LCP. Preloading too much (fonts, images) steals bandwidth from what matters - preload with care, only for the page that needs it. -> L1, F1
- Request chains: HTML -> CSS -> font, or HTML -> JS -> image. Each link waits for the previous one. Breaking the chain (preload, inline, put it in the HTML) removes whole round trips. -> L1, R1, F1
- Above the fold first, the rest later: lazy-load below-the-fold images, iframes and backgrounds; never lazy-load the logo, hero or LCP element (you'd wait for the lazy-load script before the most important image). -> L2, I2, I4

## 3. JavaScript
- **Normal vs async vs defer vs delay.** Normal scripts stop HTML parsing until downloaded and executed. `async` downloads in parallel and executes as soon as it arrives (still interrupts parsing). `defer` downloads in parallel and executes after parsing, in order (module scripts behave like defer). **Delay** = don't load at all until user interaction (scroll, mousemove, touch, key) or a timeout - the strongest technique, together with caching. "Truly defer" = load after the page has fully loaded. -> J4, T1
- **What can be delayed:** almost all third-party scripts (analytics, pixels, tag managers, chat, heatmaps, accessibility widgets, ad networks) and many first-party ones (sliders, carousels, feeds, animations below the fold). Delay must end on the first interaction so real users lose nothing; the timeout must be long enough that speed tests finish first. -> T1
- **Remove before delaying.** Unused pixel (no ads running), heatmap nobody watches, GTM used only to load GA - remove them. Delaying a pixel also improves ad data: it stops counting accidental sub-second bounces. -> T1
- **Things break when JS is delayed or deferred:** menus that need JS (submenu arrows, mobile menu double-tap), sticky headers implemented in JS, animated headlines. Better answer: implement them in CSS/HTML instead of excluding scripts (exclusions often break more, because frameworks bundle everything together). -> J5, R3
- **Order errors:** "X is not defined" = a script runs before the script that defines X (e.g. one is deferred and the other not). Fix the order or the loading mode, not the symptom. -> E1
- **Site-wide code that one page needs:** loading a feature's code on every page (classic examples: a form plugin's files on every page, a shop's cart refresh request on every page, password-strength scripts loaded site-wide). In AI-built sites: PDF export, payments, editors, charts, auth widgets or polling requests bundled or running on the homepage. Load them only where used. -> J2, R2, J6
- **Unused code is measurable:** DevTools Coverage shows unused bytes per file; PSI "Reduce unused JavaScript". -> J1, J2

## 4. CSS
- **Frameworks ship far more CSS than a page uses** (themes, UI kits and icon fonts ship everything - e.g. 1,500 icons for the 10 used). Remove unused CSS - but keep rules other pages, breakpoints, hover states and JS-added classes need (when unsure keep the rule - a safelist of selectors that must survive). In Tailwind sites this is the purge/content configuration and global CSS from libraries. -> E2
- **Render-blocking CSS:** every stylesheet in <head> blocks the first paint, and external font CSS (Google Fonts) adds a domain + a chain to the font files. -> F2, E2
- **Critical CSS / async CSS can backfire:** features like WP Rocket's "Optimize CSS delivery" often cause flashes of unstyled content and layout shifts and are better off. If a site inlines critical CSS or loads CSS async, check for FOUC/CLS. -> C2
- **Merging files** helped on HTTP/1.1; on HTTP/2+ it mostly changes the score, and it can break things. -> S4
- **Use CSS instead of JS** for sticky headers, simple animations, show/hide - it survives script delay and costs no main thread. -> J5, A1

## 5. DOM
- PSI flags a page with more than **1,500 nodes**, **depth over 32**, or **a parent with more than 60 children**. A large DOM slows style/layout (FCP, INP), uses more memory (every querySelectorAll runs over it), and makes the HTML heavier. -> E3
- Common causes, in builders and AI-generated code alike: wrapper elements only for spacing/centering, separate sections where one would do, spacer elements instead of padding, hidden "future" sections still in the markup, duplicated mobile/desktop sections. -> E3

## 6. Caching and delivery
- **Cache TTL:** the server tells the browser how long to keep a file. Static files (images, fonts, CSS, JS) should be cached long (up to 1 year); change the file name/version when the file changes (hashed build files do this automatically). -> S2
- **Page (HTML) cache** is the biggest TTFB lever: serving a ready page instead of building it per request (e.g. 900 ms -> under 200 ms). For static/SSG sites this is the CDN edge cache. -> S1
- **Query strings break the page cache:** `?fbclid=`, `?gclid=`, `?utm_*` make a URL the cache hasn't seen -> slow uncached response for exactly the visitors coming from ads and social. Check the cache ignores them. -> S5
- **A CDN does not fix a slow origin:** it caches static files; the HTML still comes from the server unless HTML is cached at the edge. After every deploy/purge the cache refills from the origin. -> S1
- **TTFB components:** DNS speed, distance to the server, server/runtime version and power, caching, amount of backend work per request (plugins then; API calls, database queries, edge functions now), slow queries. -> S1, R2
- **Preload cache / prefetch:** warm the cache so the first visitor (maybe Googlebot) isn't the one who waits; prefetch the next page on hover for faster navigation (doesn't show in tests). -> P1
- **Redirects** cost a full round trip each: http->https, www, trailing slash. Test and link the final URL. -> S3
- **Broken requests** (404s, missing images, redirected assets, dead external files) waste requests and sometimes extra domains. -> E1

## 7. Images
- Images are usually the heaviest part of a page (often over 40% of page weight).
- **Lossy vs lossless:** lossy for almost every site (big savings, invisible loss), lossless/near-lossless for photography/food sites. **PNG without transparency -> JPG/WebP.** Modern formats (WebP/AVIF) save more. Animated GIFs need a dedicated optimizer or a video instead. -> I1
- **Size to the display:** a 1920 px image shown at 400 px wastes most of its bytes; serve a smaller version on mobile (srcset/`<picture>`, or a separate mobile background), and never load both desktop and mobile versions. -> I1, I3
- **Background images** are not lazy-loaded by normal lazy-load and are discovered late (after CSS) - use real `<img>` for the LCP, and lazy-load below-the-fold backgrounds with an interaction/visibility trigger. -> L2, I4
- **Lazy-load threshold** decides how early off-screen images start (too tight = empty placeholders on fast scroll). -> I2
- **LCP image techniques, in order:** don't lazy-load it, preload it (only on that page; separate mobile/desktop with media queries), remove fade-in, serve a mobile size, and as a last resort show a tiny base64 low-res placeholder that is replaced by the real image. -> L1-L4
- **Explicit width/height** prevents layout shift. -> C1

## 8. Fonts
- **Each family and each weight is a separate request** (300/400/500/600/700/800 = six files). Find which fonts/weights are actually used (Fonts Ninja, DevTools CSS Overview), move stray text to the main font, drop the rest. -> F1
- **Self-host Google Fonts** to remove two domains and the render-blocking CSS chain; use font-display: swap so text shows immediately (trade-off: a short flash of the fallback font). Don't preload every font. -> F2, F3
- **Subset characters:** load only needed glyph ranges (Hebrew + Latin), or only the exact letters for a display/heading font (Google `text=`, unicode-range). -> F5
- **local() first** lets the browser use an installed copy. -> F2

## 9. Icons
- Icon fonts (Font Awesome, Material Icons, eicons) load hundreds of icons for a few; replace them with a small custom set or inline SVG icons imported one by one. Override hard-to-reach icons with CSS (`content` + `font-family`), fix italic rendering with `font-style: normal`. -> F4, J2

## 10. Third-party embeds
- **YouTube/Vimeo:** hundreds of KB and ~6 domains per embed -> click-to-load thumbnail. **Google Maps:** hundreds of KB, ~30 requests, several domains -> static map image that loads the iframe on click (lazy-loading the iframe only helps below the fold). **Facebook page widget:** screenshot linking to the page. -> T3
- **Preconnect** to external origins that are still needed early; add a second `crossorigin` line for CORS resources like fonts; keep dns-prefetch as a fallback after preconnect. Better still: remove or delay the domain. -> T4
- **Cloudflare Email Address Obfuscation** injects a blocking script; it protects little - turn it off or remove the plain email. -> T5

## 11. Testing method
- Incognito, logged out, cache disabled in DevTools, refresh twice so the page cache is warm; test the exact final URL; compare before/after on the same tool and location; test mobile; test real key pages, not just the homepage. -> X1
- **DevTools tools to use:** Network (filters, large rows, block request, throttling, waterfall), Coverage (unused CSS/JS), Console (404/JS errors), Sources search (Ctrl+Shift+F) to find who requests a file, Elements/Computed (rendered fonts, glyph count), CSS Overview (fonts/weights/colors), Performance (LCP element, layout shifts, long tasks), Lighthouse. -> all checks
- **Hosting matters before optimization:** moving the same site from cheap shared hosting to a fast host can cut TTFB from 1-3 s to well under 1 s with no other change. -> S1

## 12. Video, navigation and monitoring
- **Video** is the heaviest asset type: autoplay hero videos compete with the LCP; a poster image first, the video after load, and no autoplay video on mobile. Animated GIFs are 5-20× heavier than the same clip as MP4/WebM. -> V1-V3
- **Back/forward cache** shows a page instantly when the visitor presses Back - unless `unload` handlers, `Cache-Control: no-store` or open connections block it. -> P2
- **Speculation rules** let a multi-page site prerender the next page on hover, so the click feels instant. SPAs get the same from route prefetch and data caching. -> P1, P3, P4
- **Build mode:** a development build or unminified bundle can be several times slower; legacy polyfills and duplicate libraries add weight for nothing. -> J7, J8
- **Anti-flicker snippets** of A/B tools hide the entire page until their script answers - remove them where no test runs. -> T6
- **Keep it fast:** real-user data (Search Console, web-vitals) shows what visitors get; a budget checked after each publish stops regressions. -> M1, M2
