// Speed audit collector - run inside the audited page (browser JS tool or DevTools console)
// AFTER the page has fully loaded, ideally a fresh incognito load with no mouse movement yet.
// Returns a plain-text report. Uses only same-origin fetches plus Performance APIs.
// Run it from a browser in the visitors' country: the SERVER LOCATION part reports what THIS browser was served from.
(async () => {
  const out = [];
  const kb = n => Math.round((n || 0) / 1024);
  const origin = location.origin;
  const short = u => u.replace(origin, '').replace(/\?.*$/, '?…').slice(0, 120);

  // ---- 1. Raw HTML as the server sends it (no JS) ----
  const r = await fetch(location.href, { credentials: 'omit', cache: 'no-store' });
  const raw = await r.text();
  const hdr = Object.fromEntries([...r.headers]);
  // parse the raw HTML without executing it (DOMParser never runs scripts)
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  const bodyClone = doc.body ? doc.body.cloneNode(true) : null;
  if (bodyClone) bodyClone.querySelectorAll('script, style, template').forEach(el => el.remove());
  const bodyText = (bodyClone ? bodyClone.textContent : '').replace(/\s+/g, ' ').trim();
  const emptyShell = /<div id="(root|app|__next)"><\/div>/.test(raw) || bodyText.length < 200;

  // ---- 2. Platform detection ----
  // look only at tag attributes and script code, not at the visible text (a site may just mention a builder)
  const tech = [...doc.querySelectorAll('script, link, img, meta, iframe, source')].map(el => el.cloneNode(false).outerHTML).join(' ') + ' ' +
    [...doc.querySelectorAll('script')].map(el => el.textContent).join(' ') + ' ' +
    performance.getEntriesByType('resource').map(e => e.name).join(' ');
  const sig = [
    ['Lovable', /gpt-engineer-file-uploads|lovable-uploads|lovable\.app|\/~flock\.js|__l5e|lovable-tagger/i],
    ['Base44', /base44\.(app|com)\/api|@base44|base44-app|cdn\.base44/i],
    ['Bolt / StackBlitz', /bolt\.new|stackblitz/i],
    ['v0 / Next.js', /__NEXT_DATA__|\/_next\/static/i],
    ['Vite build', /\/assets\/index-[A-Za-z0-9_-]+\.js/],
    ['WordPress', /wp-content|wp-includes/i],
    ['Webflow', /webflow/i], ['Wix', /wix\.com|wixstatic/i], ['Framer', /framer/i],
  ].filter(([, rx]) => rx.test(tech)).map(([n]) => n);

  out.push('# PAGE', location.href,
    `Platform signals: ${sig.join(', ') || 'unknown'}`,
    `Server HTML: ${kb(raw.length)} KB, visible text in raw HTML: ${bodyText.length} chars -> ${emptyShell ? 'EMPTY SHELL (client-side rendered: nothing shows until JS runs)' : 'content present in HTML'}`,
    `Headers: server=${hdr.server || '-'} cache-control=${hdr['cache-control'] || '-'} encoding=${hdr['content-encoding'] || '-'} cf-cache-status=${hdr['cf-cache-status'] || '-'} x-vercel-cache=${hdr['x-vercel-cache'] || '-'}`);


  // ---- 2b. Server location (what served THIS browser) ----
  const H = k => hdr[k] || '';
  const codeName = { TLV: 'Tel Aviv', HFA: 'Haifa', FRA: 'Frankfurt', AMS: 'Amsterdam', LHR: 'London', CDG: 'Paris', ARN: 'Stockholm', DUB: 'Dublin', MXP: 'Milan', MAD: 'Madrid', IST: 'Istanbul', ATH: 'Athens', LCA: 'Larnaca', DXB: 'Dubai', IAD: 'Washington DC', CLE: 'Cleveland', SFO: 'San Francisco', PDX: 'Portland', LAX: 'Los Angeles', EWR: 'Newark', ORD: 'Chicago', DFW: 'Dallas', GRU: 'Sao Paulo', BOM: 'Mumbai', SIN: 'Singapore', HKG: 'Hong Kong', HND: 'Tokyo', NRT: 'Tokyo', ICN: 'Seoul', SYD: 'Sydney', CPT: 'Cape Town', KIX: 'Osaka', WAW: 'Warsaw', VIE: 'Vienna', ZRH: 'Zurich', MRS: 'Marseille' };
  const nameOf = c => c ? `${c.toUpperCase()}${codeName[c.slice(0, 3).toUpperCase()] ? ' (' + codeName[c.slice(0, 3).toUpperCase()] + ')' : ''}` : '';
  const edges = [];
  if (H('cf-ray')) edges.push(`Cloudflare ${nameOf(H('cf-ray').split('-').pop())} cache=${H('cf-cache-status') || '-'}`);
  if (H('x-vercel-id')) { const parts = H('x-vercel-id').split('::').slice(0, -1); edges.push(`Vercel edge ${nameOf(parts[0])}${parts[1] ? ' function ' + nameOf(parts[1]) : ''} cache=${H('x-vercel-cache') || '-'}`); }
  if (H('x-amz-cf-pop')) edges.push(`CloudFront ${nameOf(H('x-amz-cf-pop').slice(0, 3))} ${H('x-cache')}`);
  if (H('x-served-by') && /cache-/.test(H('x-served-by'))) edges.push(`Fastly ${nameOf(H('x-served-by').split('-').pop())} ${H('x-cache')}`);
  if (H('fly-request-id')) edges.push(`Fly ${nameOf(H('fly-request-id').split('-').pop())}`);
  if (H('x-railway-edge')) edges.push(`Railway ${H('x-railway-edge')}`);
  // cache layers from the outside in; the HTML came from the first layer that had it cached, otherwise from the origin
  const hit = v => /HIT|REVALIDATED|UPDATING|STALE/i.test(v || '');
  const layers = [];
  if (H('cf-ray')) layers.push([`Cloudflare ${nameOf(H('cf-ray').split('-').pop())}`, H('cf-cache-status')]);
  if (H('x-amz-cf-pop')) layers.push([`CloudFront ${nameOf(H('x-amz-cf-pop').slice(0, 3))}`, H('x-cache')]);
  if (H('x-served-by') && /cache-/.test(H('x-served-by'))) layers.push([`Fastly ${nameOf(H('x-served-by').split('-').pop())}`, H('x-cache')]);
  if (H('x-vercel-id')) { const vp0 = H('x-vercel-id').split('::').slice(0, -1); layers.push([`Vercel edge ${nameOf(vp0[0])}`, H('x-vercel-cache')]); }
  const servedBy = layers.find(([, st]) => hit(st));
  const htmlCached = !!servedBy;
  const vFn = H('x-vercel-id').split('::').slice(0, -1)[1];
  const htmlFrom = servedBy ? `${servedBy[0]} (cache ${servedBy[1]})` : `the origin server${vFn ? ' - Vercel function ' + nameOf(vFn) : ''} (not cached at any edge)`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const navE = performance.getEntriesByType('navigation')[0];
  const ms = v => Math.round(v);
  const rtt = navigator.connection && navigator.connection.rtt;
  // warm-connection request times: a small static file (edge) vs. the HTML (origin unless cached)
  const timeReq = async u => { const t0 = performance.now(); const x = await fetch(u, { method: 'HEAD', cache: 'no-store', credentials: 'omit' }); return { t: performance.now() - t0, h: x.headers }; };
  const staticUrl = (document.querySelector('link[rel~="icon"]') || {}).href || (document.querySelector('script[type="module"][src]') || {}).src;
  const sTimes = [], hTimes = [];
  for (let i = 0; i < 3; i++) {
    try { if (staticUrl && staticUrl.startsWith(origin)) sTimes.push((await timeReq(staticUrl)).t); } catch (e) {}
    try { hTimes.push((await timeReq(location.href)).t); } catch (e) {}
  }
  const minv = a => a.length ? ms(Math.min(...a)) : '-';
  const locOut = [];
  locOut.push('', '# SERVER LOCATION (as served to this browser - run from the visitors\' country)',
    `Browser time zone: ${tz} | language: ${navigator.language} | network RTT estimate: ${rtt ?? '-'} ms`,
    `Edge / server: ${edges.join(' | ') || `no CDN location header (server=${H('server') || '-'}, via=${H('via') || '-'}) - use scan.py (IP) or probes`}`,
    `HTML actually came from: ${htmlFrom}${!htmlCached ? ' -> its location is what counts' : ''} | age=${H('age') || '-'} | protocol=${navE && navE.nextHopProtocol}`,
    `Page load connection: DNS ${navE ? ms(navE.domainLookupEnd - navE.domainLookupStart) : '-'} ms | TCP+TLS ${navE ? ms(navE.connectEnd - navE.connectStart) : '-'} ms (TLS ${navE && navE.secureConnectionStart > 0 ? ms(navE.connectEnd - navE.secureConnectionStart) : '-'} ms) | request->first byte ${navE ? ms(navE.responseStart - navE.requestStart) : '-'} ms`,
    `Warm request (best of 3): static file ${minv(sTimes)} ms (~1 round trip to the edge) vs HTML ${minv(hTimes)} ms (round trip + server/origin). A large gap = distant or slow origin.`,
    `Server-Timing: ${H('server-timing') || '-'}`);

  // ---- 3. Timings ----
  const nav = performance.getEntriesByType('navigation')[0];
  const paints = Object.fromEntries(performance.getEntriesByType('paint').map(p => [p.name, Math.round(p.startTime)]));
  const lcpEntries = await new Promise(res => { const a = []; try { new PerformanceObserver(l => a.push(...l.getEntries())).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {} setTimeout(() => res(a), 300); });
  const cls = await new Promise(res => { let s = 0; try { new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) s += e.value; })).observe({ type: 'layout-shift', buffered: true }); } catch (e) {} setTimeout(() => res(s), 300); });
  const longTasks = await new Promise(res => { const a = []; try { new PerformanceObserver(l => a.push(...l.getEntries())).observe({ type: 'longtask', buffered: true }); } catch (e) {} setTimeout(() => res(a), 300); });
  const lcp = lcpEntries[lcpEntries.length - 1];
  const hiddenTab = !performance.getEntriesByType('paint').length;
  if (hiddenTab) out.push('', 'NOTE: no paint entries - the tab was loaded in the background, so FCP/LCP are missing here. Take FCP/LCP/LCP element from PSI, or reload the page with the tab in front.');
  const lcpEl = lcp && lcp.element ? (lcp.element.outerHTML || '').slice(0, 220) : '-';
  out.push('', '# TIMINGS (this device/network, not throttled)',
    `TTFB ${Math.round(nav.responseStart - nav.requestStart)} ms | FCP ${paints['first-contentful-paint'] ?? '-'} ms | LCP ${lcp ? Math.round(lcp.startTime) : '-'} ms | DCL ${Math.round(nav.domContentLoadedEventEnd)} ms | load ${Math.round(nav.loadEventEnd)} ms | CLS ${cls.toFixed(3)}`,
    `LCP element: ${lcpEl}`,
    `LCP resource: ${lcp && lcp.url ? short(lcp.url) : '(text or none)'} | in raw HTML: ${lcp && lcp.url ? raw.includes(new URL(lcp.url).pathname) : '-'} | preloaded: ${lcp && lcp.url ? /rel=["']preload["'][^>]+as=["']image/.test(raw) && raw.includes(new URL(lcp.url).pathname.split('/').pop().split('-')[0]) : '-'}`,
    `Long tasks: ${longTasks.length}, total ${Math.round(longTasks.reduce((a, t) => a + t.duration, 0))} ms, longest ${Math.round(Math.max(0, ...longTasks.map(t => t.duration)))} ms`,
    `DOM elements: ${document.getElementsByTagName('*').length}`);

  // ---- 4. Resources ----
  const res = performance.getEntriesByType('resource');
  const lcpTime = lcp ? lcp.startTime : (nav.domContentLoadedEventEnd + 1000);
  const third = res.filter(e => !e.name.startsWith(origin));
  const byType = {};
  res.forEach(e => { const t = e.initiatorType; byType[t] = byType[t] || { n: 0, kb: 0 }; byType[t].n++; byType[t].kb += kb(e.transferSize || e.encodedBodySize); });
  const beforeLcp = res.filter(e => e.startTime < lcpTime);
  out.push('', '# RESOURCES',
    `Total: ${res.length} requests, ${kb(res.reduce((a, e) => a + (e.transferSize || e.encodedBodySize || 0), 0))} KB transferred`,
    `By type: ${Object.entries(byType).map(([t, v]) => `${t} ${v.n}/${v.kb}KB`).join(' | ')}`,
    `Started before ${lcp ? 'LCP' : 'DOMContentLoaded+1s (LCP unknown)'}: ${beforeLcp.length} requests, ${kb(beforeLcp.reduce((a, e) => a + (e.transferSize || e.encodedBodySize || 0), 0))} KB  <- competes with the LCP for bandwidth`,
    `Render-blocking (per browser): ${res.filter(e => e.renderBlockingStatus === 'blocking').map(e => short(e.name)).join(' , ') || 'none reported'}`,
    `Third-party domains: ${[...new Set(third.map(e => new URL(e.name).host))].join(', ') || 'none'}`,
    '', 'Heaviest 15 (start ms | KB transferred | KB decoded | type | url):');
  [...res].sort((a, b) => (b.encodedBodySize || 0) - (a.encodedBodySize || 0)).slice(0, 15)
    .forEach(e => out.push(`  ${Math.round(e.startTime)} | ${kb(e.transferSize)} | ${kb(e.decodedBodySize)} | ${e.initiatorType} | ${short(e.name)}`));

  // ---- 5. JS ----
  const js = res.filter(e => e.initiatorType === 'script' || /\.m?js(\?|$)/.test(e.name));
  out.push('', '# JAVASCRIPT', `${js.length} files, ${kb(js.reduce((a, e) => a + (e.encodedBodySize || 0), 0))} KB compressed, ${kb(js.reduce((a, e) => a + (e.decodedBodySize || 0), 0))} KB uncompressed`);
  const mainJs = [...js].sort((a, b) => b.decodedBodySize - a.decodedBodySize)[0];
  if (mainJs && mainJs.name.startsWith(origin)) {
    try {
      const src = await fetch(mainJs.name).then(x => x.text());
      const libs = [['framer-motion', /framer-motion|motion\.div|useAnimation/], ['recharts', /recharts/], ['jspdf', /jspdf|jsPDF/], ['html2canvas', /html2canvas/], ['three.js', /THREE\.|three\.module/], ['lottie', /lottie/], ['moment', /moment\.js|moment\(/], ['lodash', /lodash/], ['supabase-js', /supabase/], ['date-fns', /date-fns/], ['react-pdf / pdfjs', /pdfjs|react-pdf/], ['xlsx', /SheetJS|xlsx/], ['mapbox/leaflet', /mapbox|leaflet/], ['@tanstack/query', /tanstack/], ['lucide icons', /lucide/], ['radix/shadcn', /radix-ui|@radix/], ['i18next', /i18next/], ['markdown', /react-markdown|remark|rehype/], ['stripe-js', /stripe/i]]
        .filter(([, rx]) => rx.test(src)).map(([n]) => n);
      const dynImports = (src.match(/import\(["'`]/g) || []).length;
      out.push(`Largest bundle ${short(mainJs.name)}: ${kb(mainJs.decodedBodySize)} KB uncompressed. Libraries spotted inside: ${libs.join(', ') || '-'}. Dynamic import() calls: ${dynImports} (0 = no code splitting)`);
    } catch (e) { out.push('Could not read main bundle'); }
  }

  // ---- 6. Images ----
  const imgs = [...document.images];
  const resMap = Object.fromEntries(res.map(e => [e.name, e]));
  out.push('', '# IMAGES', `${imgs.length} <img> elements`);
  imgs.filter(i => i.currentSrc).map(i => ({ i, e: resMap[i.currentSrc] }))
    .sort((a, b) => ((b.e && b.e.encodedBodySize) || 0) - ((a.e && a.e.encodedBodySize) || 0)).slice(0, 15)
    .forEach(({ i, e }) => {
      const shown = `${i.clientWidth}x${i.clientHeight}`; const nat = `${i.naturalWidth}x${i.naturalHeight}`;
      const ratio = i.clientWidth ? (i.naturalWidth / (i.clientWidth * (window.devicePixelRatio || 1))).toFixed(1) : 'hidden';
      out.push(`  ${kb(e && e.encodedBodySize)}KB | natural ${nat} shown ${shown} (x${ratio} too big) | loading=${i.loading} | fetchpriority=${i.fetchPriority || '-'} | w/h attrs=${i.getAttribute('width') ? 'yes' : 'NO'} | srcset=${i.srcset ? 'yes' : 'no'} | ${short(i.currentSrc)}`);
    });
  const hiddenLoaded = imgs.filter(i => i.complete && i.currentSrc && (i.clientWidth === 0 || getComputedStyle(i).display === 'none'));
  out.push(`Hidden but downloaded: ${hiddenLoaded.length} ${hiddenLoaded.map(i => short(i.currentSrc)).join(' , ')}`);
  const bgImgs = res.filter(e => e.initiatorType === 'css' && /\.(png|jpe?g|webp|avif|gif)/i.test(e.name));
  out.push(`CSS background images: ${bgImgs.map(e => `${short(e.name)} ${kb(e.encodedBodySize)}KB`).join(' , ') || 'none'}`);
  const vids = [...document.querySelectorAll('video, iframe')].map(v => `${v.tagName} ${(v.src || v.currentSrc || '').slice(0, 80)} preload=${v.preload || '-'} loading=${v.loading || '-'}`);
  out.push(`Video / iframes: ${vids.join(' , ') || 'none'}`);

  // ---- 7. Fonts ----
  const fonts = res.filter(e => /\.(woff2?|ttf|otf)(\?|$)/.test(e.name) || /fonts\.(googleapis|gstatic)/.test(e.name));
  const preloadFonts = (raw.match(/rel=["']preload["'][^>]+as=["']font/g) || []).length;
  const families = [...new Set([...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '')))];
  out.push('', '# FONTS', `${fonts.length} font requests, ${kb(fonts.reduce((a, e) => a + (e.transferSize || e.encodedBodySize || 0), 0))} KB | preloaded in HTML: ${preloadFonts} | Google Fonts: ${/fonts\.googleapis/.test(raw) ? 'YES' : 'no'} | display=swap in Google URL: ${/display=swap/.test(raw)}`,
    `Loaded families: ${families.join(', ')}`,
    `Faces loaded: ${[...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family.replace(/["']/g, '')} ${f.weight}`).join(', ')}`);

  out.push(...locOut);

  // ---- 8. Third-party tags in HTML ----
  const tags = [['Google Analytics/gtag', /googletagmanager\.com\/gtag|google-analytics\.com/], ['GTM', /googletagmanager\.com\/gtm\.js/], ['Meta Pixel', /fbevents\.js|connect\.facebook\.net/], ['Hotjar', /hotjar/], ['Microsoft Clarity', /clarity\.ms/], ['TikTok pixel', /analytics\.tiktok/], ['Intercom/Crisp/Tawk chat', /intercom|crisp\.chat|tawk\.to/], ['Platform analytics (Lovable)', /\/~flock\.js|__l5e\/events/], ['YouTube embed', /youtube\.com\/embed/], ['Google Maps', /maps\.google|google\.com\/maps/]]
    .filter(([, rx]) => rx.test(raw) || res.some(e => rx.test(e.name))).map(([n]) => n);
  out.push('', '# THIRD-PARTY TAGS', tags.join(', ') || 'none', `In <head> before app script: ${/<head>[\s\S]*?(gtag|fbevents|hotjar|clarity)[\s\S]*?<script[^>]+type="module"/.test(raw) ? 'YES (loads before the app)' : 'no'}`);

  // ---- 9. Caching of static assets ----
  const sample = [mainJs, res.find(e => /\.css/.test(e.name) && e.name.startsWith(origin)), res.find(e => e.initiatorType === 'img' && e.name.startsWith(origin)), fonts.find(e => e.name.startsWith(origin))].filter(Boolean);
  out.push('', '# CACHE HEADERS (static files)');
  for (const e of sample) {
    try { const h = await fetch(e.name, { method: 'HEAD', cache: 'no-store' }); out.push(`  ${short(e.name)} -> ${h.headers.get('cache-control') || 'none'}`); } catch (err) {}
  }

  // ---- 10. Query string + redirect quick checks ----
  const t = async u => { const s = performance.now(); const x = await fetch(u, { credentials: 'omit', cache: 'no-store' }); await x.body.getReader().read(); return Math.round(performance.now() - s); };
  const base = await t(location.href); const fb = await t(location.href + (location.search ? '&' : '?') + 'fbclid=' + Date.now());
  out.push('', '# QUICK CHECKS', `HTML response: plain ${base} ms vs ?fbclid ${fb} ms`, `Console errors: check DevTools Console manually (not readable from here)`);


  // ---- 11. API / backend and critical-path origins (G2, G3) ----
  const api = res.filter(e => ['fetch', 'xmlhttprequest', 'beacon'].includes(e.initiatorType) && !/\/~flock|__l5e|google-analytics|googletagmanager|clarity|hotjar|facebook/.test(e.name));
  const byHost = {};
  api.forEach(e => { const h = new URL(e.name).host; (byHost[h] = byHost[h] || []).push(e); });
  out.push('', '# API / BACKEND REQUESTS (G2) - duration includes the round trips',
    ...Object.entries(byHost).map(([h, a]) => { const d = a.map(e => e.duration).sort((x, y) => x - y); const first = a[0]; const conn = first.connectEnd > first.connectStart ? ` | first connection ${ms(first.connectEnd - first.connectStart)} ms` : ''; return `  ${h}: ${a.length} requests | fastest ${ms(d[0])} ms | median ${ms(d[Math.floor(d.length / 2)])} ms | first starts at ${ms(first.startTime)} ms${conn}${/supabase\.co/.test(h) ? ' | Supabase - check the project region' : ''}${/firebase|firestore|googleapis/.test(h) ? ' | Firebase/Google - check the location' : ''}`; }));
  if (!api.length) out.push('  none on this page');
  const early = res.filter(e => !e.name.startsWith(origin) && e.startTime < lcpTime && !['fetch', 'xmlhttprequest'].includes(e.initiatorType));
  const eh = {}; early.forEach(e => { const h = new URL(e.name).host; eh[h] = eh[h] || { n: 0, max: 0 }; eh[h].n++; eh[h].max = Math.max(eh[h].max, e.duration); });
  out.push(`Third-party origins before LCP (G3): ${Object.entries(eh).map(([h, v]) => `${h} ${v.n} files, slowest ${ms(v.max)} ms`).join(' | ') || 'none'}`);

  // ---- 12. Build, HTML weight, inline data (J7, J8, J9, I6, S8) ----
  let mainSrc = '';
  try { if (mainJs && mainJs.name.startsWith(origin)) mainSrc = await fetch(mainJs.name).then(x => x.text()); } catch (e) {}
  const devBuild = /react-dom\.development|validateDOMNesting|This is the development version|\[vite\] connecting/.test(mainSrc) || res.some(e => /\/@vite\/client|\/@react-refresh|webpack-hmr|_next\/webpack-hmr/.test(e.name));
  const lines = mainSrc ? mainSrc.split('\n').length : 0;
  let mapStatus = '-';
  if (mainJs && mainJs.name.startsWith(origin)) { try { const m = await fetch(mainJs.name.split('?')[0] + '.map', { method: 'HEAD', cache: 'no-store' }); mapStatus = m.ok && !/text\/html/.test(m.headers.get('content-type') || '') ? 'PUBLIC (.map reachable)' : 'not reachable'; } catch (e) {} }
  const legacy = ['core-js', 'regenerator-runtime', 'babel-polyfill', 'whatwg-fetch'].filter(n => mainSrc.includes(n));
  const inlineScripts = [...raw.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].reduce((a, m) => a + m[1].length, 0);
  const inlineStyles = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].reduce((a, m) => a + m[1].length, 0);
  const b64 = str => (str.match(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g) || []).reduce((a, x) => a + x.length, 0);
  const bigSvgs = [...document.querySelectorAll('svg')].filter(v => v.outerHTML.length > 20000).length;
  const nextData = (raw.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/) || [, ''])[1].length;
  out.push('', '# BUILD AND WEIGHT',
    `Development build signs: ${devBuild ? 'YES - development build is live (J7)' : 'no'} | main bundle lines: ${lines} (${lines > 2000 ? 'looks UNMINIFIED' : 'minified'}) | source map: ${mapStatus}`,
    `Legacy polyfills in main bundle: ${legacy.join(', ') || 'none'} (J8)`,
    `HTML weight: ${kb(raw.length)} KB raw | inline scripts ${kb(inlineScripts)} KB | inline styles ${kb(inlineStyles)} KB | __NEXT_DATA__ ${kb(nextData)} KB`,
    `Inline base64 images: HTML ${kb(b64(raw))} KB, main bundle ${kb(b64(mainSrc))} KB | inline SVGs > 20 KB: ${bigSvgs} (I6)`,
    `Cookies on this domain: ${document.cookie.length} bytes`);

  // ---- 13. Mobile, video, widgets, navigation, rendering (N3, V1-V3, T6, T7, S7, P2, P3, E4, A2) ----
  const vp = (document.querySelector('meta[name="viewport"]') || {}).content;
  const videos = [...document.querySelectorAll('video')].map(v => { const e = resMap[v.currentSrc]; const top = v.getBoundingClientRect().top + scrollY; return `${short(v.currentSrc || v.src || (v.querySelector('source') || {}).src || '')} ${e ? kb(e.encodedBodySize || e.transferSize) + 'KB' : '?KB'} autoplay=${v.autoplay} preload=${v.preload} poster=${v.poster ? 'yes' : 'NO'} ${top < innerHeight ? 'FIRST SCREEN' : 'below fold'}`; });
  const gifs = res.filter(e => /\.gif(\?|$)/i.test(e.name)).map(e => `${short(e.name)} ${kb(e.encodedBodySize)}KB`);
  const antiFlicker = [['Google Optimize / async-hide', /async-hide|googleoptimize|optimize\.js/], ['VWO', /_vwo_code|visualwebsiteoptimizer/], ['Optimizely', /optimizely/], ['AB Tasty', /abtasty/], ['Convert', /convertexperiments|cdn-\d\.convertexperiments/]].filter(([, rx]) => rx.test(raw)).map(([n]) => n);
  const htmlHidden = getComputedStyle(document.documentElement).opacity === '0' || getComputedStyle(document.body).opacity === '0';
  const widgets = [['Cookiebot', /cookiebot/i], ['OneTrust', /onetrust|cookielaw/i], ['CookieYes', /cookieyes/i], ['Complianz', /complianz/i], ['UserWay', /userway/i], ['accessiBe', /accessibe|acsbapp/i], ['EqualWeb', /equalweb/i], ['Nagishli', /nagishli/i]].filter(([, rx]) => rx.test(raw) || res.some(e => rx.test(e.name))).map(([n]) => n);
  const headSync = (raw.match(/<head[\s\S]*?<\/head>/) || [''])[0].match(/<script(?![^>]*\b(async|defer|type="module"))[^>]*\bsrc=["'][^"']+/g) || [];
  let cv = false; try { for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (r.cssText.includes('content-visibility')) { cv = true; break; } } catch (e) {} if (cv) break; } } catch (e) {}
  const layoutProps = /^(top|left|right|bottom|width|height|margin|padding|box-shadow|filter|border-width|font-size)/;
  const badAnims = [...new Set((document.getAnimations ? document.getAnimations() : []).flatMap(a => { try { const t = a.effect && a.effect.target; const props = a.effect.getKeyframes().flatMap(k => Object.keys(k)).filter(k => layoutProps.test(k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()))); return props.length ? [`${t ? t.tagName.toLowerCase() + (t.className && typeof t.className === 'string' ? '.' + t.className.split(' ')[0] : '') : '?'}: ${[...new Set(props)].join('/')}`] : []; } catch (e) { return []; } }))];
  const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
  out.push('', '# MOBILE, MEDIA, WIDGETS, NAVIGATION',
    `Viewport meta: ${vp || 'MISSING (N3)'}${/user-scalable=no|maximum-scale=1(\.0)?\b/.test(vp || '') ? ' - zoom disabled' : ''}`,
    `Videos: ${videos.join(' , ') || 'none'} | GIFs: ${gifs.join(' , ') || 'none'}`,
    `Anti-flicker / A-B testing: ${antiFlicker.join(', ') || 'none'}${htmlHidden ? ' | page is currently HIDDEN (opacity 0)' : ''} (T6)`,
    `Consent / accessibility widgets: ${widgets.join(', ') || 'none'} | blocking scripts in <head>: ${headSync.length} ${headSync.map(x => x.replace(/.*src=["']/, '').slice(0, 60)).join(' , ')}`,
    `Service worker controlling the page: ${sw ? sw.scriptURL : 'no'} (S7)`,
    `Back/forward cache: HTML cache-control=${H('cache-control') || '-'}${/no-store/.test(H('cache-control')) ? ' -> no-store BLOCKS bfcache' : ''} | navigation type=${navE && navE.type}${navE && navE.notRestoredReasons ? ' | notRestoredReasons=' + JSON.stringify(navE.notRestoredReasons.reasons || navE.notRestoredReasons) : ''} (P2 - press Back/Forward and rerun for reasons)`,
    `Speculation rules: ${document.querySelector('script[type="speculationrules"]') ? 'yes' : 'no'} | prefetch links: ${document.querySelectorAll('link[rel="prefetch"],link[rel="prerender"]').length} (P1, P3)`,
    `Page height: ${(document.documentElement.scrollHeight / innerHeight).toFixed(1)} screens | content-visibility used: ${cv ? 'yes' : 'no'} (E4)`,
    `Running animations of layout properties: ${badAnims.join(' , ') || 'none at this moment'} (A2)`);

  return out.join('\n');
})();
