#!/usr/bin/env python3
"""Quick automated pass over a live page for the audit checklist.

Usage:
  python3 scan.py https://example.com/            # fetch live page\n  python3 scan.py https://example.com/ --psi      # also pull Google PageSpeed Insights
  python3 scan.py https://example.com/ --html saved.html   # use saved HTML (no network)
  python3 scan.py https://example.com/ --from IL  # server location measured from probes in a country (Globalping)

Prints signals per checklist ID (references/checklist.md). It only sees the HTML and
headers - checks marked MANUAL in the output still need PSI, GTmetrix,
DevTools or wp-admin. Standard library only.
"""
import json
import re
import socket
import sys
import time
import urllib.request
import urllib.error
from urllib.parse import urlparse, urlencode, urlunparse, parse_qsl

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(url, follow=True):
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
    t0 = time.time()
    try:
        resp = opener.open(req, timeout=30)
        first = resp.read(1)
        ttfb = time.time() - t0
        body = first + resp.read()
        return resp.status, dict(resp.headers), body.decode("utf-8", "replace"), ttfb, resp.geturl()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), "", time.time() - t0, url


def with_param(url, k, v):
    p = urlparse(url)
    q = parse_qsl(p.query) + [(k, v)]
    return urlunparse(p._replace(query=urlencode(q)))


SIGNALS = [
    # (check id, label, regex)
    ("L2", "Image with lazy attributes near top of page (check it is not the LCP/logo)", r"data-lazy-src|loading=\"lazy\""),
    ("L2", "Image preload present", r"rel=[\"']preload[\"'][^>]*as=[\"']image"),
    ("E2", "Gutenberg block library CSS", r"block-library"),
    ("E2", "Emoji script", r"wp-emoji-release|_wpemojiSettings"),
    ("E2", "wp-embed script", r"wp-embed(\.min)?\.js"),
    ("E2", "Dashicons on frontend", r"dashicons(\.min)?\.css"),
    ("E2", "jQuery Migrate", r"jquery-migrate"),
    ("T1", "Google Tag Manager", r"googletagmanager\.com/gtm\.js|googletagmanager\.com/gtag/js"),
    ("T1", "Facebook Pixel", r"fbevents\.js|connect\.facebook\.net/[^\"']*/fbevents"),
    ("T1", "Hotjar", r"static\.hotjar\.com|hotjar"),
    ("T1", "Google Analytics (analytics.js)", r"google-analytics\.com/analytics\.js"),
    ("T1", "tawk.to chat", r"embed\.tawk\.to"),
    ("T1", "Chat widget (Intercom/Crisp/Drift/Zendesk)", r"intercom|crisp\.chat|drift\.com|zdassets"),
    ("T1", "Facebook customer chat", r"customerchat|fb-customerchat"),
    ("T5", "Cloudflare email-decode", r"email-decode\.min\.js|__cf_email__"),
    ("T3", "YouTube iframe", r"youtube(-nocookie)?\.com/embed"),
    ("T3", "Vimeo iframe", r"player\.vimeo\.com"),
    ("T3", "Google Maps iframe", r"google\.com/maps/embed|maps\.google\.[a-z.]+/maps\?|maps\.googleapis\.com/maps/api/js"),
    ("T3", "Facebook page widget / SDK", r"fb-page|fb_iframe_widget|connect\.facebook\.net/[^\"']*/sdk\.js"),
    ("T4", "preconnect hints present", r"rel=[\"']preconnect"),
    ("E2", "Contact Form 7 assets", r"contact-form-7"),
    ("J2", "WooCommerce cart fragments", r"cart-fragments|wc-cart-fragments"),
    ("J2", "Password strength meter / zxcvbn", r"zxcvbn|password-strength-meter"),
    ("F2", "Google Fonts from Google", r"fonts\.googleapis\.com|fonts\.gstatic\.com"),
    ("F1", "Font Awesome", r"font-awesome|fontawesome"),
    ("F1", "Font Awesome v4 shims", r"v4-shims"),
    ("F1", "Elementor eicons", r"elementor-icons|eicons"),
    ("S1", "WP Rocket footprint", r"WP Rocket|wp-rocket|rocket-lazyload|RocketLazyLoad"),
    ("S1", "Other cache plugin footprint", r"litespeed|LiteSpeed|Swift Performance|w3 total cache|WP Fastest Cache|Breeze"),
    ("T1", "Delayed scripts already (WP Rocket / Flying Scripts)", r"rocketlazyloadscript|flying-scripts|data-rocket-src"),
    ("J1", "Deferred scripts", r"<script[^>]+\sdefer"),
    ("I2", "Lazy load in use", r"lazyload|data-lazy|loading=\"lazy\""),
    ("E3", "Elementor page", r"elementor"),
    ("T6", "A/B testing anti-flicker snippet", r"async-hide|_vwo_code|optimizely|abtasty|convertexperiments"),
    ("T7", "Consent / accessibility widget", r"cookiebot|onetrust|cookielaw|cookieyes|complianz|userway|acsbapp|accessibe|equalweb|nagishli"),
    ("J7", "Development build / dev server", r"react-dom\.development|/@vite/client|@react-refresh"),
    ("V1", "Autoplay video", r"<video[^>]+autoplay"),
    ("V2", "GIF images", r"\.gif[\"'?]"),
    ("I6", "Inline base64 images", r"data:image/[a-z+]+;base64,"),
    ("P3", "Speculation rules", r"type=[\"']speculationrules"),
    ("N3", "Viewport meta", r"<meta[^>]+name=[\"']viewport"),
]


# ---------- G1-G4: server location ----------
CODE_NAMES = {"TLV": "Tel Aviv", "HFA": "Haifa", "FRA": "Frankfurt", "AMS": "Amsterdam", "LHR": "London", "CDG": "Paris",
              "ARN": "Stockholm", "DUB": "Dublin", "MXP": "Milan", "MAD": "Madrid", "IST": "Istanbul", "DXB": "Dubai",
              "IAD": "Washington DC", "CLE": "Cleveland", "SFO": "San Francisco", "PDX": "Portland", "LAX": "Los Angeles",
              "EWR": "Newark", "ORD": "Chicago", "GRU": "Sao Paulo", "BOM": "Mumbai", "SIN": "Singapore", "HKG": "Hong Kong",
              "HND": "Tokyo", "NRT": "Tokyo", "ICN": "Seoul", "SYD": "Sydney", "ATH": "Athens", "LCA": "Larnaca"}
import ipaddress
# Anycast CDN ranges (same IP answers from many cities): Cloudflare, Vercel
# The published CIDR ranges are kept in assets/anycast-ranges.json (data only, no addresses are contacted).
import os as _os
_RANGES_FILE = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "assets", "anycast-ranges.json")
try:
    with open(_RANGES_FILE, encoding="utf-8") as _f:
        ANYCAST = [ipaddress.ip_network(n) for n in json.load(_f)["ranges"]]
except (OSError, ValueError, KeyError):
    ANYCAST = []


def code_name(c):
    c = (c or "").upper()
    return f"{c} ({CODE_NAMES[c[:3]]})" if c[:3] in CODE_NAMES else c


def edge_info(h):
    """Read CDN location/cache headers. Location = the edge that answered THIS machine."""
    g = {k.lower(): v for k, v in h.items()}
    out = []
    if "cf-ray" in g:
        out.append(f"Cloudflare {code_name(g['cf-ray'].split('-')[-1])} cache={g.get('cf-cache-status', '-')}")
    if "x-vercel-id" in g:
        parts = g["x-vercel-id"].split("::")[:-1]
        fn = f" function {code_name(parts[1])}" if len(parts) > 1 else ""
        out.append(f"Vercel edge {code_name(parts[0]) if parts else '?'}{fn} cache={g.get('x-vercel-cache', '-')}")
    if "x-amz-cf-pop" in g:
        out.append(f"CloudFront {code_name(g['x-amz-cf-pop'][:3])} {g.get('x-cache', '')}")
    if "cache-" in g.get("x-served-by", ""):
        out.append(f"Fastly {code_name(g['x-served-by'].split('-')[-1])} {g.get('x-cache', '')}")
    if "fly-request-id" in g:
        out.append(f"Fly {code_name(g['fly-request-id'].split('-')[-1])}")
    if "x-railway-edge" in g:
        out.append(f"Railway {g['x-railway-edge']}")
    return out or [f"no CDN location header (server={g.get('server', '-')}, via={g.get('via', '-')})"]


def ip_geo(ip):
    for url in (f"https://ipinfo.io/{ip}/json", f"http://ip-api.com/json/{ip}"):
        try:
            d = json.loads(urllib.request.urlopen(url, timeout=10).read())
            return f"{d.get('city', '')}, {d.get('country', d.get('countryCode', ''))} - {d.get('org', d.get('isp', ''))}"
        except Exception:
            continue
    return "lookup unavailable from here"


def globalping(host, path, country):
    """Real probes in a country: ping + HTTP timings. Free API, no key for light use."""
    api = "https://api.globalping.io/v1/measurements"

    def run(body):
        req = urllib.request.Request(api, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        mid = json.loads(urllib.request.urlopen(req, timeout=30).read())["id"]
        for _ in range(30):
            time.sleep(1.5)
            d = json.loads(urllib.request.urlopen(f"{api}/{mid}", timeout=30).read())
            if d.get("status") != "in-progress":
                return d.get("results", [])
        return []

    loc = [{"country": country, "limit": 3}]
    print(f"\n## G1 Measured from probes in {country} (Globalping)")
    try:
        for r in run({"type": "ping", "target": host, "locations": loc, "measurementOptions": {"packets": 4}}):
            pr, st = r.get("probe", {}), r.get("result", {}).get("stats", {})
            print(f"- ping from {pr.get('city')} ({pr.get('network')}): avg {st.get('avg')} ms, min {st.get('min')} ms")
        for r in run({"type": "http", "target": host, "locations": loc,
                      "measurementOptions": {"protocol": "HTTPS", "request": {"method": "GET", "path": path or "/"}}}):
            pr, res = r.get("probe", {}), r.get("result", {})
            t = res.get("timings", {})
            hdr = res.get("headers", {}) or {}
            print(f"- HTTPS from {pr.get('city')}: DNS {t.get('dns')} ms | TCP {t.get('tcp')} ms | TLS {t.get('tls')} ms | "
                  f"first byte {t.get('firstByte')} ms | total {t.get('total')} ms | status {res.get('statusCode')}")
            print(f"  served by: {' | '.join(edge_info(hdr))}")
        print("- Read: TCP ≈ 1 round trip to whoever answered; first byte ≫ TCP = the HTML came from farther away (origin). "
              "Compare with server-location.md section 4.")
    except Exception as e:
        print(f"- Globalping unavailable from here ({e}). Use check-host.net / globalping.io in a browser, "
              f"or run assets/collect.js in a browser in {country}.")


def server_location(url, headers):
    p = urlparse(url)
    print("\n## G1 Server location (from THIS machine - edge codes show the edge nearest to here, not to the visitors)")
    try:
        t0 = time.time()
        ips = sorted({a[4][0] for a in socket.getaddrinfo(p.hostname, 443, proto=socket.IPPROTO_TCP)})
        dns_ms = (time.time() - t0) * 1000
        print(f"- DNS {dns_ms:.0f} ms -> {', '.join(ips)}")
        for ip in ips[:2]:
            any_ = any(ipaddress.ip_address(ip) in n for n in ANYCAST if ipaddress.ip_address(ip).version == n.version)
            note = " (anycast CDN IP - geolocation meaningless, measure from the country)" if any_ else ""
            print(f"- {ip}: {ip_geo(ip)}{note}")
    except Exception as e:
        print(f"- DNS lookup failed: {e}")
    for line in edge_info(headers):
        print(f"- {line}")


def psi(url):
    """Google PageSpeed Insights API (mobile). Optional, needs internet."""
    import json
    api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?" + urlencode({"url": url, "strategy": "mobile", "category": "performance"})
    try:
        data = json.loads(urllib.request.urlopen(api, timeout=120).read())
    except Exception as e:
        print(f"\n## PSI: failed ({e}) - run it at pagespeed.web.dev")
        return
    lh = data["lighthouseResult"]
    a = lh["audits"]
    print(f"\n## PSI mobile score: {round(lh['categories']['performance']['score']*100)}")
    for k in ("first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index", "server-response-time"):
        if k in a:
            print(f"- {a[k]['title']}: {a[k].get('displayValue','')}")
    lcp = a.get("largest-contentful-paint-element", {}).get("details", {})
    try:
        print(f"- LCP element: {lcp['items'][0]['items'][0]['node']['snippet'][:200]}")
    except Exception:
        pass
    print("- Failing audits (map to the checklist):")
    for k, v in a.items():
        if v.get("score") is not None and v["score"] < 0.9 and v.get("scoreDisplayMode") in ("numeric", "binary", "metricSavings"):
            print(f"  - {v['title']} {v.get('displayValue','')}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    url = sys.argv[1]
    html = None
    if "--html" in sys.argv:
        html = open(sys.argv[sys.argv.index("--html") + 1], encoding="utf-8", errors="replace").read()

    print(f"# Quick scan: {url}\n")
    headers = {}
    if html is None:
        try:
            fetch(url)
        except Exception as e:
            print(f"No network access from here ({e}).\nOpen the page in a browser, save the HTML and rerun with --html, and run PSI at pagespeed.web.dev.")
            sys.exit(2)
        # A2 redirects
        p = urlparse(url)
        variants = {url}
        host = p.netloc
        alt_host = host[4:] if host.startswith("www.") else "www." + host
        variants.add(urlunparse(p._replace(scheme="http")))
        variants.add(urlunparse(p._replace(netloc=alt_host)))
        print("## S3 Redirects")
        for v in sorted(variants):
            try:
                code, h, _, _, _ = fetch(v, follow=False)
                loc = h.get("Location", h.get("location", ""))
                print(f"- {v} -> {code} {loc}")
            except Exception as e:
                print(f"- {v} -> error {e}")
        code, h0, _, _, _ = fetch(url, follow=False)
        if code in (301, 302, 307, 308):
            print(f"- FAIL: the tested URL itself redirects - test and link the final URL")

        # B1 TTFB (warm the cache first)
        print("\n## S1 TTFB")
        fetch(url)
        code, headers, html, ttfb, final = fetch(url)
        print(f"- status {code}, TTFB {ttfb*1000:.0f} ms from this location ({'FAIL' if ttfb > 0.2 else 'PASS'} vs 200 ms) - also check tools.keycdn.com/performance")
        # B4 query strings
        print("\n## S1 Query-string cache")
        for k in ("fbclid", "gclid", "utm_source"):
            _, h2, _, t2, _ = fetch(with_param(url, k, str(int(time.time()))))
            flag = "FAIL? (much slower than base)" if t2 > max(0.4, ttfb * 2.5) else "ok"
            print(f"- ?{k}=...: TTFB {t2*1000:.0f} ms -> {flag}")
        # headers
        print("\n## Server / cache headers (S1, S2)")
        for k in ("server", "x-powered-by", "cf-cache-status", "x-cache", "x-litespeed-cache", "x-cache-enabled", "cache-control", "age", "x-proxy-cache"):
            for hk, hv in headers.items():
                if hk.lower() == k:
                    print(f"- {hk}: {hv}")
        server_location(url, headers)
        if "--from" in sys.argv:
            globalping(urlparse(url).hostname, urlparse(url).path, sys.argv[sys.argv.index("--from") + 1].upper())
        m = re.search(r"PHP/([\d.]+)", " ".join(headers.values()))
        if m:
            print(f"- PHP {m.group(1)} (upgrade if old)")

    print("\n## HTML signals")
    found_any = False
    for cid, label, rx in SIGNALS:
        n = len(re.findall(rx, html, re.I))
        if n:
            found_any = True
            print(f"- [{cid}] {label}: {n} match(es)")
    if not found_any:
        print("- nothing matched")

    # external domains
    doms = sorted(set(re.findall(r"(?:src|href)=[\"']https?://([^/\"']+)", html)))
    own = urlparse(url).netloc.replace("www.", "")
    ext = [d for d in doms if own not in d]
    print(f"\n## External domains referenced in HTML ({len(ext)}) - T1, T4")
    for d in ext:
        print(f"- {d}")

    imgs = re.findall(r"<img[^>]+>", html, re.I)
    no_dims = [i for i in imgs if not (re.search(r"\swidth=", i) and re.search(r"\sheight=", i))]
    print(f"\n## Images: {len(imgs)} <img> tags, {len(no_dims)} without width+height (C1)")
    first = imgs[:3]
    for i in first:
        lazy = "LAZY" if re.search(r"data-lazy|loading=\"lazy\"", i) else "eager"
        src = re.search(r"(?:data-lazy-src|src)=[\"']([^\"']+)", i)
        print(f"- first images: {lazy} {src.group(1) if src else ''}  (L2: logo and hero must be eager)")

    scripts = re.findall(r"<script[^>]+src=[\"']([^\"']+)", html, re.I)
    styles = re.findall(r"<link[^>]+rel=[\"']stylesheet[\"'][^>]+href=[\"']([^\"']+)", html, re.I)
    plugins = sorted(set(re.findall(r"/wp-content/plugins/([^/]+)/", html)))
    print(f"\n## Assets: {len(scripts)} external scripts, {len(styles)} stylesheets (J1, E2)")
    print(f"## Plugins loading assets on this page ({len(plugins)}): {', '.join(plugins)}")
    print(f"## HTML size: {len(html)//1024} KB, approx elements: {html.count('<') // 2} (E3 - use PSI for exact DOM size)")

    if "--psi" in sys.argv:
        psi(url)

    print("\nNext: PSI mobile + desktop and assets/collect.js inside the page for timings, LCP element, images and fonts.")


if __name__ == "__main__":
    main()
