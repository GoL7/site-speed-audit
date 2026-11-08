# Speed checklist - 69 checks (AI-built sites: Lovable, Claude, Base44, Bolt, v0, Replit, Cursor; WordPress via `wordpress.md`)

Every check has:
- **Detect** - evidence from the collector (`assets/collect.js`), PSI mobile/desktop, or DevTools.
- **Impact** - which LCP phase / metric it hits (see `impact-analysis.md` to estimate seconds).
- **Prompt** - text the site owner pastes into their builder. Fill every `{placeholder}` with the real findings (file names, sizes, selectors). Prompts are in English because builders follow English most precisely; the report around them is in the user's language.
- **Why** - see `principles.md` for the reasoning behind each check.
- **Tier** - the default report tier when the check fails: **Critical** / **Should** (should improve) / **Optional**. Move an item up or down by its measured seconds (`impact-analysis.md` section 4).

Status per check: PASS / FAIL / N/A / UNKNOWN (say what is missing to decide). Do not skip checks; every one gets a status with evidence.

Every prompt ends with the same guard line - include it:
> Do not change the design, texts or behaviour. After the change, run a production build and confirm it succeeds and the page looks identical.

---

## R. Rendering architecture (usually the biggest win on AI-built sites)

### R1. Page is an empty shell until JavaScript runs (client-side rendering)
- **Detect:** collector "EMPTY SHELL"; raw HTML has `<div id="root"></div>` and no text. PSI LCP breakdown: large "element render delay" and/or "resource load delay". FCP waits for the main bundle.
- **Impact:** FCP + LCP: nothing paints until the whole bundle downloads, parses and runs (often 2-6 s on mobile). Also SEO: crawlers and social previews see an empty page.
- **Tier:** Critical
- **Prompt (Vite/React - Lovable, Bolt, Claude):**
  ```
  The homepage {and other marketing pages: /pricing, /about} is client-side rendered: the HTML is an empty <div id="root"> and nothing appears until the {X} KB JavaScript bundle runs. Pre-render these public routes to static HTML at build time (for example with vite-plugin-prerender / a build-time prerender step using the existing React components), so the HTML already contains the hero section, headings and the hero image, and React hydrates on top. Keep the app/dashboard routes client-side. If a prerender step is not possible in this build environment, instead put a static HTML copy of the above-the-fold hero (same markup and Tailwind classes, real text, the hero <img>) inside <div id="root"> in index.html so it paints before the JS loads and is replaced when React mounts.
  ```
- **Prompt (Next.js - v0, Vercel):** `Make {routes} static/server-rendered: remove "use client" from page-level components where not needed, move client-only parts into small client components, and use generateStaticParams/static rendering for marketing pages.`

### R2. Render waits for data or auth
- **Detect:** in the main bundle or Network: Supabase/Firebase/API calls (e.g. `auth/v1/user`, `rest/v1/...`, `getSession`) start before the hero renders; a spinner or blank screen shows first; LCP element appears only after an XHR/fetch finishes.
- **Impact:** element render delay + extra round trips.
- **Tier:** Critical
- **Prompt:**
  ```
  The public homepage waits for {auth session / data request: name it} before rendering. Render the marketing content immediately without waiting for auth or data; check the session in the background and only gate the dashboard/protected routes. Do not show a full-page loader on public pages.
  ```

### R3. Entrance animations hide the LCP element
- **Detect:** hero heading/image starts with `opacity:0` / `transform` (framer-motion `initial={{opacity:0}}`, AOS, animate-on-scroll classes); PSI LCP element is the animated block; GTmetrix/PSI filmstrip shows the hero appearing late.
- **Impact:** element render delay (a fade-in on the LCP image moves LCP to the end of the animation).
- **Tier:** Should (Critical when mobile LCP > 4 s)
- **Prompt:**
  ```
  The hero {heading/image} uses an entrance animation that starts at opacity 0, which delays Largest Contentful Paint. Render the hero section fully visible from the first paint (no opacity/transform entrance animation on the hero and on anything above the fold). Keep animations only for sections below the fold.
  ```

---

## L. Largest Contentful Paint element

### L1. LCP image discovered late
- **Detect:** collector "LCP resource ... in raw HTML: false / preloaded: false"; PSI "LCP request discovery" / large resource load delay; LCP image is imported in a component or is a CSS background.
- **Impact:** resource load delay (browser can't start the download until JS/CSS runs).
- **Tier:** Should (Critical when mobile LCP > 4 s)
- **Prompt:**
  ```
  The LCP image is {file}. Make the browser start downloading it immediately: add <link rel="preload" as="image" href="{final URL}" fetchpriority="high"> in index.html <head> (use imagesrcset/imagesizes if the image has a srcset; separate preloads with media queries if mobile and desktop use different images). Serve it from a stable path (public/) so the URL in the preload matches. Keep fetchpriority="high" and loading="eager" on the <img>, and never lazy-load it.
  ```

### L2. LCP image lazy-loaded or a CSS background
- **Detect:** `loading="lazy"` on the hero/logo; LCP is a `background-image`.
- **Tier:** Should (Critical when mobile LCP > 4 s)
- **Prompt:** `Remove loading="lazy" from the hero image and the header logo, and render the hero background as a real <img> (object-fit: cover) with fetchpriority="high" instead of a CSS background-image.`

### L3. LCP image too heavy
- **Detect:** collector images list: LCP image KB and "x too big" ratio; PSI "Improve image delivery".
- **Impact:** resource load duration ≈ KB / 200 per second on mobile.
- **Tier:** Should (Critical when mobile LCP > 4 s)
- **Prompt:** see I1 - run it first for the LCP image. Target: hero under ~100 KB on mobile (WebP/AVIF, width = display width × 2).


### L4. Mobile LCP still slow after all of the above
- **Detect:** mobile LCP still red after L1-L3 and the image is already small.
- **Tier:** Optional
- **Prompt:**
  ```
  As a last step for the mobile hero, show an ultra-light placeholder immediately: inline a ~1-3 KB blurred/low-resolution version of {hero image} as a base64 data URI background on the hero container (mobile only), and let the real image load on top of it. Keep the real <img> with fetchpriority="high".
  ```

---

## G. Server location (checked here, reported first - see `server-location.md`)

### G1. HTML served from outside the visitors' country
- **Detect:** collector "SERVER LOCATION" run in a browser in the visitors' country, or `scan.py --from <CC>`: edge code (`cf-ray` suffix, `x-vercel-id`, `x-amz-cf-pop`, `x-served-by`), cache status of the HTML (`cf-cache-status`, `x-vercel-cache`, `x-cache`), connect/TLS/TTFB times. Edge in the country with `DYNAMIC`/`MISS` = origin abroad.
- **Impact:** TTFB, FCP, LCP: ~3 × extra RTT per new connection (`server-location.md` section 5). PSI does not show it (tests from Google data centers).
- **Tier:** Critical - always the first item of the report when it fails, with the link to the recommended host.
- **Fix:** move hosting to the visitors' country - recommendation text in `server-location.md` section 7 (for Israel: an Israeli host such as 4CODE). Second best, if the owner can't move: cache the HTML at a CDN data center in the country (static pages only).

### G2. API / database / auth in another country
- **Detect:** collector "API / BACKEND REQUESTS" durations from the visitors' country; provider region in the dashboard (Supabase Project Settings > General); requests ≥ 3× a local round trip.
- **Impact:** in client-rendered apps every page waits for 1-4 sequential backend requests; each pays the extra RTT (+3 RTT for the first connection to that domain). Also slows every action (login, save, search).
- **Tier:** Critical when public pages or the main app flow wait for it; Should when only background requests use it.
- **Fix:** closest region the provider offers (text in `server-location.md` section 7), and stop public pages from waiting for it (R2).

### G3. Critical-path files from distant third-party origins
- **Detect:** collector per-origin timings: fonts, images (e.g. builder upload storage), scripts from another domain that load before the LCP, with slow connect/TTFB.
- **Tier:** Should.
- **Prompt:**
  ```
  These files load before the page appears but come from other domains far from our visitors: {origins with ms}. Serve them from the site itself: self-host the fonts in /public/fonts, move the images used on the first screen into the project (public/ or src/assets, WebP), and delay the third-party scripts until interaction.
  ```

### G4. Slow DNS
- **Detect:** collector "DNS" > ~50 ms on repeat checks from the country; `scan.py` DNS time; very short DNS TTL (< 300 s) on the main record.
- **Tier:** Optional (Should if > 150 ms).
- **Fix:** use a fast DNS provider with servers in the country (e.g. Cloudflare DNS), TTL of at least 1 hour on stable records. Manual step at the domain/DNS provider.

---

## J. JavaScript

### J1. One huge JS bundle, no code splitting
- **Detect:** collector "Largest bundle ... KB uncompressed, Dynamic import() calls: 0"; PSI "Reduce unused JavaScript", long "element render delay".
- **Impact:** download + parse + execute before render (CSR) - often the #2 cost after R1.
- **Tier:** Should (Critical when it is the main LCP/TBT cost)
- **Prompt:**
  ```
  The main JavaScript bundle is {X} KB ({Y} KB compressed) and contains everything for every page. Add route-level code splitting: load every route except the homepage with React.lazy + Suspense, and lazy-load heavy components that are not visible on first screen ({list}). Configure Vite build.rollupOptions.output.manualChunks to split vendor libraries. Target: the homepage needs under 150 KB compressed JS to render.
  ```

### J2. Heavy libraries loaded on the homepage
- **Detect:** collector "Libraries spotted inside": pdf (jspdf, html2canvas, pdfjs), charts (recharts), three.js, lottie, xlsx, maps, markdown, moment, lodash, the full icon set.
- **Tier:** Should
- **Prompt:**
  ```
  The homepage bundle includes {libraries} that are only needed for {feature, e.g. PDF export / dashboard charts}. Import them dynamically (await import('...')) only when the user triggers that feature or opens that route. Import icons one by one (named imports) instead of whole icon packs, replace moment with date-fns or native Intl, and import lodash functions individually.
  ```

### J3. Long main-thread tasks / forced reflow
- **Detect:** collector long tasks > 50 ms; PSI TBT, "Forced reflow", "Minimize main-thread work".
- **Impact:** TBT, INP, render delay.
- **Tier:** Should
- **Prompt:**
  ```
  PSI reports long main-thread tasks ({ms}) and forced reflows in {file/function if shown}. Find code that reads layout (offsetHeight, getBoundingClientRect, scroll position) right after changing styles, and batch reads before writes (or use requestAnimationFrame / ResizeObserver / IntersectionObserver). Move non-urgent work (analytics init, carousels, observers) to requestIdleCallback or after first interaction.
  ```


### J4. Script loading mode
- **Detect:** in raw HTML, `<script src>` in <head> without async/defer/type="module"; inline scripts that block; PSI "Render-blocking requests".
- **Tier:** Should
- **Prompt:**
  ```
  These scripts block rendering: {list}. Make first-party scripts type="module" or defer, move third-party scripts to load after interaction (see analytics prompt), and keep only tiny inline config snippets in <head>.
  ```

### J5. Features that break when scripts are delayed
- **Detect:** before any interaction: menu arrows/mobile menu, sticky header, animated headline or carousel don't work or jump.
- **Tier:** Optional
- **Prompt:**
  ```
  {feature} only works after the JavaScript loads. Implement it with HTML/CSS so it works on first paint: sticky header with position: sticky/fixed and reserved top padding equal to the header height; text animations with CSS keyframes; menu toggles with a <details>/<button> + CSS state rather than JS-injected markup.
  ```

### J6. Background requests running on every page
- **Detect:** Network shows recurring fetch/XHR on page load or on an interval (cart/session refresh, notifications polling, realtime subscriptions, feature flags) on public pages.
- **Tier:** Should
- **Prompt:**
  ```
  On the public pages these requests run on every load: {list}. Start them only where needed (logged-in area / when the cart has items / when the widget opens), skip them for visitors with no session, and stop polling when the tab is hidden.
  ```

### J7. Development build, source maps or debug code in production
- **Detect:** collector "BUILD": `react-dom.development` / "This is the development version" strings, `/@vite/client` or `/@react-refresh` requests, unminified bundle (many newlines, long variable names), `.js.map` files reachable for the main bundle, `console.log` noise.
- **Impact:** a development React build is several times larger and slower to execute (TBT, LCP, INP); public source maps expose the source code (security, not speed).
- **Tier:** Critical when a development build is live; Should for source maps / debug code.
- **Prompt:**
  ```
  The live site serves {a development build / source maps / unminified code}: {evidence}. Make sure the published site uses the production build (vite build / next build with NODE_ENV=production), minified, with sourcemap disabled for the public build (build.sourcemap: false, or "hidden" if error tracking needs it), and remove debugging console.log calls.
  ```

### J8. Legacy JavaScript, polyfills and duplicate libraries
- **Detect:** PSI "Legacy JavaScript" / "Duplicated JavaScript"; bundle contains `core-js`, `regenerator-runtime`, two versions of the same library (e.g. two date libraries, lodash + lodash-es, two icon packs); build target es5.
- **Tier:** Optional (Should when > 50 KB).
- **Prompt:**
  ```
  The bundle ships legacy polyfills and duplicate libraries: {list with KB}. Set the build target to modern browsers (Vite build.target "es2020" or browserslist "defaults, not IE 11"), remove polyfills that modern browsers don't need, and keep one library per job ({which one to keep}) - replace the other's imports.
  ```

### J9. Hydration cost and large inline data (server-rendered sites)
- **Detect:** Next.js `__NEXT_DATA__` / RSC payload or inline JSON over ~50 KB in the HTML (collector "HTML weight"); console "hydration" errors; long task right after FCP.
- **Impact:** a heavier HTML and a long main-thread task while the page "wakes up" (TBT, INP); hydration errors re-render the whole page.
- **Tier:** Should.
- **Prompt:**
  ```
  The HTML carries {X} KB of inline page data and hydration takes {ms}. Pass only the fields the page renders (not whole API responses), keep static sections as server components / plain HTML with no client JS, and fix the hydration mismatch errors: {errors}.
  ```

---

## T. Third-party scripts

### T1. Analytics/pixels/chat load before the page
- **Detect:** collector "THIRD-PARTY TAGS" + "In <head> before app script: YES"; gtag, GTM, Meta pixel, Hotjar, Clarity, TikTok, chat widgets in the first requests.
- **Impact:** bandwidth + main thread at the worst moment; each new domain costs round trips.
- **Tier:** Should
- **Prompt:**
  ```
  {gtag / Meta pixel / Hotjar / chat} loads in <head> before the app. Remove unused ones. Load the rest only after the first user interaction (scroll, mousemove, touchstart, keydown) or after 5 seconds, whichever comes first: move the snippets out of <head> into a small loader that injects the scripts on that trigger, once. Keep the dataLayer/gtag function stubs defined early so events are queued and not lost.
  ```

### T2. Platform-injected scripts
- **Detect:** Lovable `/~flock.js`, `/__l5e/events...`, "Edit with Lovable" badge; similar on other builders.
- **Tier:** Optional
- **Fix:** usually not removable by prompt; note it and check the platform's settings (badge removal on paid plans, analytics toggle). Mark N/A if it can't be controlled.

### T3. Embeds: YouTube, Vimeo, Maps, social widgets
- **Detect:** iframes from youtube/vimeo/google maps/facebook on page load (collector "Video / iframes").
- **Tier:** Should
- **Prompt:**
  ```
  Replace the {YouTube/Vimeo/Google Maps} embed with a click-to-load facade: show a lightweight thumbnail image (with a play button for video) and insert the real iframe only when the user clicks. Lazy-load the thumbnail if it is below the fold.
  ```

### T4. Connections to external domains still needed early
- **Detect:** third-party domains used above the fold (font CDN, image CDN, API).
- **Tier:** Optional
- **Prompt:** `Add <link rel="preconnect" href="{origin}"> (plus a second line with crossorigin for fonts) in index.html for {origins} that are used during the first render; remove preconnects to domains that are no longer used early.`


### T5. Cloudflare Email Address Obfuscation
- **Detect:** `email-decode.min.js` / `__cf_email__` in HTML.
- **Tier:** Optional
- **Fix:** Cloudflare dashboard > Scrape Shield > Email Address Obfuscation OFF (manual step, not a prompt), or show a contact link instead of the address.

### T6. A/B testing or "anti-flicker" snippet hides the page
- **Detect:** `async-hide` class / `opacity: 0 !important` on `<html>` or `<body>` set by a snippet (Google Optimize leftover, VWO `_vwo_code`, Optimizely, AB Tasty, Convert); collector "ANTI-FLICKER".
- **Impact:** the whole page stays invisible until the testing script answers or the timeout ends (often up to 3-4 s) - FCP and LCP move to that time.
- **Tier:** Critical when present on a landing page; remove leftovers of tools no longer used.
- **Prompt:**
  ```
  The page includes an A/B testing anti-flicker snippet ({tool}) that hides the page until the script loads. {If the tool is no longer used:} Remove the snippet and the script. {If it is used:} Limit it to the pages with a running test, lower its timeout to 500 ms, and load the testing script from the same origin if the tool supports it.
  ```

### T7. Cookie-consent / accessibility / chat widgets blocking the first paint
- **Detect:** consent manager (Cookiebot, OneTrust, CookieYes, Complianz), accessibility overlay or chat widget loaded synchronously in `<head>`; banner that is the LCP element on mobile.
- **Tier:** Should.
- **Prompt:**
  ```
  {Widget} loads synchronously in <head> and delays the first paint. Load it with async/defer (consent managers: use the vendor's async snippet and keep only the tiny default-consent stub inline), and render the cookie banner as a small fixed bar so it doesn't become the largest element on mobile.
  ```

---

## I. Images

### I1. Images heavier than they are displayed
- **Detect:** collector images: KB, natural vs shown size ("x3.5 too big"), PNG photos, no srcset; PSI "Improve image delivery" savings.
- **Impact:** load duration of the LCP if it is one of them; bandwidth contention for everything that starts before LCP; total payload.
- **Tier:** Should (Critical when the LCP image is > 300 KB)
- **Prompt:**
  ```
  These images are far larger than displayed: {file: KB, natural WxH, shown WxH} ... Convert them to WebP (AVIF where supported), resize each to 2x its largest displayed width, and serve responsive versions with srcset + sizes (mobile ~480px, desktop width). Keep PNG only where transparency is required, and even then export WebP with alpha. Target: no image above 150 KB, hero under 100 KB on mobile. Add explicit width and height attributes to every <img>.
  ```

### I2. Images downloaded but not visible / loaded too early
- **Detect:** collector "Hidden but downloaded" (e.g. light+dark logo variants, desktop+mobile duplicates); below-the-fold images without `loading="lazy"`.
- **Tier:** Should
- **Prompt:**
  ```
  {N} images are downloaded but not shown ({files}) - e.g. both dark and light logo versions. Render only the variant that is visible (switch the src by theme instead of rendering both and hiding one with CSS), or use one inline SVG logo with currentColor. Add loading="lazy" and decoding="async" to every image below the fold.
  ```


### I3. Desktop images on mobile (or both versions loaded)
- **Detect:** collector in mobile emulation (DevTools device mode, reload): natural width far above display; both desktop and mobile variants downloaded.
- **Tier:** Should
- **Prompt:**
  ```
  On mobile the page downloads desktop-size images ({files}) and both desktop and mobile versions of {section}. Serve mobile sizes with srcset/sizes or <picture> media sources, and render only the variant for the current breakpoint (no CSS-hidden duplicates).
  ```

### I4. Background images
- **Detect:** collector "CSS background images"; large backgrounds below the fold loading at start; LCP is a background.
- **Tier:** Optional
- **Prompt:**
  ```
  Below-the-fold background images ({files}) load immediately. Load them only when their section approaches the viewport (IntersectionObserver adds a class that sets the background-image), keep the first screen's background as a real <img> with fetchpriority="high", and serve WebP at display size.
  ```

### I5. Favicon / icons / manifest images oversized
- **Detect:** favicon.png > 10 KB, loaded more than once.
- **Tier:** Optional
- **Prompt:** `Replace favicon.png ({KB}) with a 32x32 favicon.ico/PNG (<5 KB) plus a 180x180 apple-touch-icon and 192/512 manifest icons, each referenced once.`

### I6. Images or SVGs inlined as huge code
- **Detect:** collector "INLINE": base64 `data:image` strings in the HTML or the main JS bundle over ~10 KB total, very large inline `<svg>` (illustrations with thousands of path points).
- **Impact:** inline data can't be cached separately or lazy-loaded and makes the HTML/JS heavier for every page.
- **Tier:** Optional (Should when > 100 KB).
- **Prompt:**
  ```
  {N} KB of images/illustrations are inlined in the {HTML / JS bundle}: {which}. Move them to files (WebP for photos, optimized .svg for illustrations, run through SVGO), referenced with <img> and lazy-loaded below the fold. Keep inline only small icons (< 2 KB).
  ```

---

## V. Video and animated images

### V1. Heavy video on the first screen
- **Detect:** collector "Video": autoplay `<video>` near the top, its file size, `preload="auto"`, no `poster`, no mobile version; background video on mobile.
- **Impact:** competes with the LCP for bandwidth; on mobile often several MB.
- **Tier:** Should (Critical when the video is > 2 MB and starts before the LCP).
- **Prompt:**
  ```
  The hero video ({file}, {MB}) starts downloading immediately. Show a poster image (WebP, display size) first and start the video only after the page has loaded; use preload="none" (or "metadata"), serve a compressed MP4 (H.264) / WebM under ~1-2 MB at the displayed size, and on mobile show only the poster image.
  ```

### V2. Animated GIFs
- **Detect:** `.gif` images > ~100 KB (collector images list).
- **Tier:** Should.
- **Prompt:**
  ```
  These animated GIFs are heavy: {files with KB}. Replace each with a muted, looping, autoplaying <video playsinline> (MP4 + WebM), or an animated WebP, at the displayed size, lazy-loaded when below the fold.
  ```

### V3. Self-hosted videos below the fold loading early
- **Detect:** `<video>` elements below the fold without `preload="none"`, downloading on page load.
- **Tier:** Optional.
- **Prompt:** `Set preload="none" and a poster image on every video below the fold, and start loading a video only when it scrolls into view or is clicked.`

---

## F. Fonts

### F1. Too many font families/weights, too many preloads
- **Detect:** collector FONTS: requests, families, faces loaded, preload count. Each weight is a separate file; preloads compete with the LCP image for bandwidth.
- **Tier:** Should
- **Prompt:**
  ```
  The site loads {N} font files from {families} ({weights}) and preloads {P} of them. Keep one font family (two at most) and only the weights actually used ({e.g. 400, 700}); remove the unused @font-face rules and files. Preload at most one font file - the one used by the hero heading - and nothing else.
  ```

### F2. Google Fonts from Google's servers / render-blocking font CSS
- **Detect:** `fonts.googleapis.com` stylesheet in <head> (render-blocking + 2 extra domains).
- **Tier:** Should
- **Prompt:**
  ```
  Self-host the {family} font: download the woff2 files for the used weights and Hebrew/Latin subsets only, put them in /public/fonts, declare @font-face with font-display: swap in the main CSS, and remove the fonts.googleapis.com <link> and its preconnects. If {family} is not actually used on the page, just remove it.
  ```

### F3. Text invisible while fonts load / layout shift from fonts
- **Detect:** PSI "Font display"; CLS when the font swaps.
- **Tier:** Optional
- **Prompt:** `Add font-display: swap to every @font-face, and add size-adjust/ascent-override fallback metrics (or a matching system fallback stack) so the swap does not shift layout.`


### F4. Icon fonts
- **Detect:** Font Awesome, Material Icons, eicons, icomoon or similar font/CSS files; collector font list.
- **Tier:** Should
- **Prompt:**
  ```
  The site loads the {icon font} ({KB}) for {N} icons. Replace them with inline SVG icons imported individually (e.g. lucide-react named imports), remove the icon font CSS and files.
  ```

### F5. Full character sets / unneeded subsets
- **Detect:** font files much larger than ~20-30 KB per weight; subsets for languages the site doesn't use.
- **Tier:** Optional
- **Prompt:**
  ```
  Subset the self-hosted fonts to the characters the site uses (Hebrew + basic Latin + digits/punctuation) with unicode-range in @font-face; for the decorative heading font include only the glyphs needed for the headings.
  ```

---

## S. Server, delivery and caching

### S1. Slow TTFB / no CDN edge cache for HTML
- **Detect:** collector TTFB; PSI "Server response time"; tools.keycdn.com/performance worldwide.
- **Tier:** Should (Critical when TTFB > 0.8 s)
- **Fix/prompt:** hosting level. Measure TTFB **from the visitors' country** (G1) - a low TTFB in PSI or from your own location proves nothing about them. If the server is abroad, G1 is the fix. If it is in the country and still slow: page/HTML caching, a stronger plan, fewer backend calls per request (R2), current runtime version.

### S2. Short cache lifetime on static files
- **Detect:** collector CACHE HEADERS; PSI "Use efficient cache lifetimes". Hashed files (`index-AbC123.js`) should be `max-age=31536000, immutable`; images/fonts in /public at least 30 days to 1 year.
- **Tier:** Should
- **Prompt (when the host reads config files):**
  ```
  Static files are served with short cache lifetimes ({file: cache-control}). Add caching headers: /assets/* (hashed build files) "Cache-Control: public, max-age=31536000, immutable"; /fonts/* and images "public, max-age=2592000"; index.html "no-cache". Use the host's config ({vercel.json headers / netlify _headers / public/_headers}). Rename non-hashed files when they change.
  ```
- On Lovable/Base44 the host controls headers: if a custom domain goes through the owner's Cloudflare, add a Cache Rule there instead.

### S3. Redirect chain on the main URL
- **Detect:** http->https, www<->non-www or trailing-slash redirects before the HTML; links in ads/social pointing to redirecting URLs.
- **Tier:** Should
- **Fix:** pick one canonical URL, redirect once at the DNS/CDN level, and use it everywhere.

### S4. Compression and protocol
- **Detect:** collector encoding (want br or gzip on HTML/JS/CSS); waterfall shows HTTP/2+.
- **Tier:** Should (Critical when HTML/JS are not compressed at all)
- **Fix:** host/CDN setting; usually PASS on builder hosting.


### S5. Ad/social visitors get uncached pages (query strings)
- **Detect:** collector QUICK CHECKS (plain vs ?fbclid); repeat with ?gclid and ?utm_source; much slower = cache miss. Also check `cf-cache-status`/`x-cache` = MISS with the parameter.
- **Tier:** Should
- **Fix:** CDN/host cache key must ignore fbclid, gclid, utm_*, ref. On Cloudflare: Cache Rule with query string ignored for these, or a redirect rule stripping them. Usually PASS on static hosting (every URL serves the same file).

### S6. Protocol extras: HTTP/3 and 103 Early Hints
- **Detect:** `alt-svc: h3` header / `nextHopProtocol` h3 in the collector; host support for 103 Early Hints.
- **Tier:** Optional.
- **Fix:** host/CDN setting (Cloudflare: HTTP/3 and Early Hints toggles). Usually PASS or N/A on builder hosting.

### S7. Service worker that slows or breaks loading
- **Detect:** collector "Service worker: controlled"; navigation with a service worker slower than without (DevTools > Application > bypass for network); stale content after deploys; a service worker that only re-fetches from the network (no gain, extra startup cost).
- **Tier:** Should.
- **Prompt:**
  ```
  The site registers a service worker ({file}) that {adds startup delay / serves stale pages / caches nothing useful}. {Either:} remove it and add a self-unregistering version so existing visitors are cleaned up, {or:} make it precache only the hashed build assets, serve navigations network-first with a short timeout, and enable navigation preload.
  ```

### S8. Heavy HTML document or large cookies
- **Detect:** collector "HTML weight" > ~100 KB compressed (inline CSS/JS/data); `document.cookie` over ~1 KB sent with every request to the domain (also to static files on the same domain).
- **Tier:** Optional (Should when the HTML is > 200 KB).
- **Prompt:** `The HTML is {X} KB because of {inline styles/scripts/data}. Move large inline CSS/JS into cached files, keep only what the first screen needs inline, and drop cookies that the public pages don't use.`

---

## C. Layout stability (CLS)

### C1. Elements move while loading
- **Detect:** collector CLS; PSI "Avoid large layout shifts", images without width/height, late banners/cookie bars, font swap.
- **Tier:** Should (Critical when CLS > 0.25)
- **Prompt:**
  ```
  CLS is {value}. Add width and height (or aspect-ratio) to all images and embeds, reserve space for content that loads later ({banner, carousel, testimonials}), render the cookie banner as an overlay instead of pushing content, and avoid inserting content above existing content after load.
  ```


### C2. Flash of unstyled content (critical/async CSS)
- **Detect:** filmstrip/video shows the page unstyled then restyled; CSS loaded with media="print" onload tricks or inlined critical CSS that doesn't match.
- **Tier:** Should
- **Prompt:** `Remove the async/critical CSS loading trick for {file}; load the main stylesheet normally (it is small after purging) so the first paint is fully styled.`

---

## N. Interaction (INP)

### N1. Slow response to clicks/typing
- **Detect:** field INP in PSI; lab TBT; DevTools Performance recording of the main interaction (open menu, submit form, generate). Check app pages too, not just the homepage.
- **Tier:** Should (Critical when INP > 500 ms)
- **Prompt:**
  ```
  Interactions on {page/control} are slow (INP {ms}). Give immediate visual feedback first, then do heavy work asynchronously; debounce input handlers; avoid re-rendering large lists on each keystroke (memoize, virtualize long lists); move heavy computation (PDF generation, parsing) to a Web Worker or behind await import().
  ```

### N2. Scroll and touch handlers that block scrolling
- **Detect:** PSI "Does not use passive listeners to improve scrolling performance"; JS scroll handlers that change styles on every scroll event; janky scroll in the Performance panel.
- **Tier:** Should.
- **Prompt:**
  ```
  Scrolling is janky: {handlers / evidence}. Mark touchstart/touchmove/wheel listeners { passive: true }, replace scroll handlers that check positions with IntersectionObserver, and throttle the rest with requestAnimationFrame. Use CSS position: sticky instead of JS-driven sticky headers.
  ```

### N3. Missing or wrong viewport meta tag
- **Detect:** collector "Viewport": no `<meta name="viewport" content="width=device-width, initial-scale=1">`, or `user-scalable=no` / `maximum-scale=1`.
- **Impact:** on mobile the page renders at desktop width (tiny text, tap delays); disabling zoom is an accessibility failure.
- **Tier:** Critical when missing; Should when zoom is disabled.
- **Prompt:** `Add <meta name="viewport" content="width=device-width, initial-scale=1"> to index.html <head> and remove maximum-scale/user-scalable restrictions.`

---

## A. Effects and animation cost

### A1. Expensive visual effects on mobile
- **Detect:** large `backdrop-filter`/`filter: blur`, animated gradients, canvas/WebGL/particles, Lottie, autoplay background video, many simultaneous framer-motion animations; DevTools Performance shows paint/composite heavy frames.
- **Tier:** Should
- **Prompt:** `On mobile, disable or simplify {effects}: replace animated blur/glow backgrounds with static images or CSS gradients, pause offscreen animations (IntersectionObserver), respect prefers-reduced-motion, and don't autoplay background video on mobile (show a poster image).`

### A2. Animations of layout properties
- **Detect:** collector "Non-composited animations" (CSS animations/transitions of `top`, `left`, `width`, `height`, `margin`, `padding`, `box-shadow`, `filter`); PSI "Avoid non-composited animations".
- **Impact:** every frame recalculates layout/paint - jank on mobile, and shifts count toward CLS.
- **Tier:** Should.
- **Prompt:**
  ```
  These animations change layout properties: {selectors and properties}. Animate transform and opacity instead (e.g. translateY instead of top, scale instead of width/height, a pseudo-element's opacity instead of box-shadow), keeping the same look and timing.
  ```

---

## E. Errors and waste

### E1. Console errors, 404s, failed requests
- **Detect:** DevTools Console + Network (status 4xx/5xx, blocked requests); PSI "Browser errored".
- **Tier:** Should (Critical when it breaks a key flow)
- **Prompt:** `Fix these console errors and failed requests: {list with URLs}. Remove references to missing files, and stop calling endpoints that fail on the public homepage.`

### E2. Unused CSS
- **Detect:** PSI "Reduce unused CSS"; DevTools Coverage.
- **Tier:** Optional
- **Prompt:** `Make sure Tailwind purges unused classes (content paths cover all components), remove unused global CSS and imported CSS from libraries not used on this page, and lazy-load CSS of lazily-loaded components.`

### E3. DOM too large
- **Detect:** collector DOM elements > 1,500; PSI "Avoid an excessive DOM size" (also depth > 32 or a parent with > 60 children).
- **Tier:** Optional (Should above 3,000 elements)
- **Prompt:** `Reduce DOM size on {page}: remove wrapper divs that only add spacing, render long lists/sections lazily or virtualize them, and don't render hidden mobile and desktop duplicates of the same section.`

### E4. Very long pages rendered all at once
- **Detect:** collector "Page height" > ~8 screens and no `content-visibility` in the CSS; long style/layout tasks in the Performance panel.
- **Tier:** Optional.
- **Prompt:** `The page is {N} screens long and the browser lays out all of it on load. Add content-visibility: auto with a contain-intrinsic-size estimate to each major section below the first screen, so off-screen sections are rendered only when they approach the viewport.`

### E5. Memory growth in long sessions (apps)
- **Detect:** DevTools Memory/Performance monitor: JS heap and DOM nodes keep growing while using the app; intervals, listeners or subscriptions not cleaned up on unmount.
- **Tier:** Optional (Should for dashboards used for hours).
- **Prompt:** `Memory grows while using {page}. Clean up intervals, event listeners, realtime subscriptions and observers in each effect's cleanup function, and cap in-memory lists/caches.`

---

## P. Navigation

### P1. Slow page-to-page navigation
- **Detect:** route change downloads a new chunk after click; no prefetch.
- **Tier:** Optional
- **Prompt:** `Prefetch the code chunk of a route when the user hovers or focuses its link (and for the 1-2 most likely next routes when the browser is idle).`

### P2. Back/forward cache blocked
- **Detect:** PSI "Page prevented back/forward cache restoration"; HTML served with `Cache-Control: no-store`; `unload` event handlers; open WebSocket/BroadcastChannel on leave; DevTools > Application > Back/forward cache > Test.
- **Impact:** pressing Back reloads the whole page instead of showing it instantly.
- **Tier:** Optional (Should for content/shop sites where Back is common).
- **Prompt:** `Make the page eligible for the back/forward cache: replace unload handlers with pagehide/visibilitychange, close realtime connections on pagehide and reopen on pageshow, and don't send Cache-Control: no-store on public pages.`

### P3. Multi-page site without instant navigation
- **Detect:** classic multi-page site (each link loads a new HTML page) with no `<script type="speculationrules">` or link prefetch.
- **Tier:** Optional.
- **Prompt:** `Add a speculation rules script that prerenders same-site links on hover (eagerness "moderate") and prefetches them on pointer down, excluding logout, cart and admin URLs.`

### P4. Every in-app navigation shows a loader or refetches everything
- **Detect:** client-side route change shows a full-page spinner, refetches data that was just loaded, or remounts the layout (header/menu flashes).
- **Tier:** Should.
- **Prompt:** `Navigating between {pages} shows a full-page loader and refetches the same data. Keep the shared layout mounted, cache API responses (e.g. React Query staleTime of a few minutes), show the new page immediately with section-level skeletons, and prefetch the data of the next likely page on hover.`

---

## M. Monitoring and keeping it fast

### M1. No real-user measurement
- **Detect:** no Search Console Core Web Vitals report checked, no `web-vitals` library / host analytics (e.g. Vercel Speed Insights, Cloudflare Web Analytics) collecting LCP/INP/CLS from real visitors; CrUX has no data for the site.
- **Tier:** Optional.
- **Prompt:** `Add real-user Core Web Vitals measurement: load the web-vitals library after the page loads and send LCP, INP, CLS, FCP and TTFB with the page path and visitor country to {analytics}. Do not block rendering.`

### M2. No performance budget
- **Detect:** nothing in the build/CI stops a regression (no size limit, no Lighthouse check).
- **Tier:** Optional.
- **Fix:** run `scripts/lighthouse_runs.mjs <url> --budget assets/budget.json` after each publish, or add the equivalent to CI (Lighthouse CI / size-limit). Budget starting points in `assets/budget.json`: homepage JS ≤ 150 KB compressed, total ≤ 1 MB, LCP ≤ 2.5 s, TBT ≤ 200 ms, CLS ≤ 0.1. Tighten after the fixes.

---

## X. Test setup and verification

### X1. Test correctly
- Test logged-out, incognito, mobile PSI 3 runs (median), plus desktop; homepage + 2-3 key pages (pricing/landing + the main app page). Record before numbers.
- After each prompt is applied and published: rerun the collector and PSI, mark PASS/FAIL, keep before/after.
- Measure the server location from the visitors' country (G1-G2), not only from PSI.

### X2. Repeatable lab runs
- When Chrome/Node are available: `node scripts/lighthouse_runs.mjs <url> --runs 3` (mobile) and `--desktop`; report the median, not the best run. PSI single runs vary by ±10 points.

---

## WordPress
For a WordPress site apply the same checks with the plugin/snippet fixes in `wordpress.md`.
