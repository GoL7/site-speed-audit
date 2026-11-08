# WordPress sites

Use this file only when the collector shows `wp-content`. The diagnosis and ranking are the same as for any site (`impact-analysis.md`, `checklist.md`); here are the WordPress ways to apply each fix.

Tools referred to below: a cache/optimization plugin (WP Rocket or a free one: LiteSpeed Cache on LiteSpeed servers, W3 Total Cache, WP Fastest Cache, Breeze), **Code Snippets** (PHP only), **WPCode** or **Header Footer Code Manager** (HTML/CSS/JS only - never PHP), **Asset CleanUp** or **Perfmatters** (unload files per page), **OMGF** (self-host Google Fonts), an image optimizer (ShortPixel, Imagify, EWWW, Robin).

## Check -> WordPress fix

| Check | WordPress fix |
|---|---|
| G1 server location | Check where the hosting server is (IP geolocation works for most WordPress hosts; behind Cloudflare use the host's panel or `scan.py --from <CC>`). Abroad for a local audience -> move to a host with servers in the visitors' country (Critical). If moving is not possible: Cloudflare with HTML caching (APO or a Cache Everything rule for logged-out visitors) so pages are served from a local data center. |
| G2 backend | WooCommerce/membership sites can't cache logged-in or cart pages - those always pay the distance to the server; another reason the server must be local. |
| S1 TTFB | Page cache plugin first (largest effect). Then: current PHP, host near the audience, fast DNS (Cloudflare), fewer/lighter plugins, find slow queries with Query Monitor, drop background-heavy plugins (broken-link checkers, stats). Cheap shared hosting is the usual root cause - move to managed/cloud hosting. |
| S2 cache lifetime | Cache plugin's browser-cache option, host panel setting, `.htaccess` expires rules (back up first), or a Cloudflare Cache Rule (Browser TTL 1 year for static files). |
| S3 redirects | One canonical URL (https + chosen www form + trailing slash); fix internal links, ads and social links. |
| S5 query strings | Make sure the cache ignores `fbclid`, `gclid`, `utm_*`, `ref`. WP Rocket does by default; LiteSpeed: add them to "Drop Query String"; otherwise a Cloudflare rule or `.htaccess` redirect that strips them. |
| L1-L2 LCP image | Exclude the hero/logo from lazy load (plugin exclusion field or `data-no-lazy`), preload it on that page only (snippet A or B below), remove entrance animation. |
| L4 last resort | Low-res placeholder (snippet C). |
| J4 render-blocking JS | "Load JS deferred" in the cache plugin (keep jQuery safe mode if things break). |
| T1 third-party | "Delay JavaScript execution" in WP Rocket (3.9+ delays everything except exclusions). Without it: Flying Scripts with precise keywords (`googletagmanager.com/gtm`, `fbevents.js`, `customerchat.js`, `static.hotjar.com`) and a long timeout; exclude delayed files from JS merging. Scripts injected by a plugin can only be delayed through that plugin's own file. |
| J5 breakage from delay | Snippets D (submenu arrow) and E (mobile menu double tap); sticky header via CSS (snippet F); exclude a script on one page only (snippet G). |
| J2 / J6 site-wide plugin code | Unload a plugin's CSS/JS on pages that don't use it (Asset CleanUp / Perfmatters / Plugin Organizer). Contact Form 7 refill request: output `wpcf7.cached = 0;` after CF7's script (snippet H). WooCommerce: "Disable Cart Fragments" plugin (stops the AJAX call while the cart is empty); don't open the registration form in a site-wide popup (it loads the password-strength scripts everywhere) or disable the meter. |
| E2 unused CSS | WP Rocket "Remove Unused CSS" with `assets/safelist-wprocket.txt`. Free route: Debloat + Autoptimize (Autoptimize: optimize CSS, empty exclusion list; Debloat: Remove Unused CSS, all stylesheets, delay original CSS, disabled for admins) with `assets/safelist-debloat.txt` and `assets/debloat-skip-uncached.php`. Compare `?nodebloat` against the normal page and add missing selectors (wildcards allowed). |
| E2 junk assets | Site-wide unloads: emoji, embeds, dashicons, block library CSS on builder sites, jQuery Migrate, comment-reply; disable XML-RPC if unused. |
| C2 FOUC | Turn off "Optimize CSS delivery" / critical-CSS features when they cause flashes or shifts. |
| E3 DOM | Elementor: enable optimized DOM output / Flexbox containers; no columns just for centering, one section where backgrounds are the same, padding instead of spacers, delete hidden leftover sections. |
| I1 images | Image optimizer, lossy (glossy/near-lossless for photo sites), max width ~1920 px, convert opaque PNG to JPG/WebP, WebP delivery; optimize animated GIFs before upload. |
| I2 lazy load | Cache plugin lazy load (or Lazy Load Optimizer / Optimole); exclude above-the-fold images; threshold filter `rocket_lazyload_threshold` (default 300 px) in Code Snippets; if not using WP Rocket, turn off core lazy load with `add_filter('wp_lazy_loading_enabled','__return_false');` so one system controls it. |
| I3 mobile images | Elementor responsive background per device, media-query CSS (snippet I) or `<picture>` (snippet J). |
| I4 backgrounds | Snippet K. |
| F1-F3, F5 fonts | Find used fonts (Fonts Ninja extension, DevTools CSS Overview), unload theme fonts nobody uses, keep 2-3 weights, self-host with OMGF (swap, used subsets only), don't preload all fonts; for a decorative heading font use the Google `text=` parameter (snippet L). |
| F4 icon fonts | Elementor: disable Font Awesome 4 shims; build a small icon set (Fontello), upload it (Elementor Custom Icons, or a custom-icons plugin when icons live only in header/footer), replace icons, then dequeue Font Awesome/eicons; for icons Elementor doesn't expose, override with CSS (snippet M). |
| T3 embeds | Cache plugin "replace YouTube iframe with preview image"; Vimeo via a lazy-video plugin or Elementor image overlay + lazy load; Google Maps as a static image that loads the iframe on click; Facebook page widget -> screenshot linking to the page. Elementor lazy video needing two taps: add `allow="autoplay"` to its iframe with a find-and-replace plugin. |
| T4 preconnect | Snippet N in the header. |
| T5 | Cloudflare > Scrape Shield > Email Address Obfuscation off. |
| P1 | WP Rocket "link preloading" (don't add Flying Pages on top); otherwise Flying Pages, with its script delayed. |

## Snippets
All names are placeholders - replace selectors, paths and page slugs with the site's own.

**A. Preload the hero image (header, that page only)**
```html
<link rel="preload" as="image" href="/wp-content/uploads/hero.webp" fetchpriority="high">
```
**B. Different hero for mobile and desktop**
```html
<link rel="preload" as="image" href="/wp-content/uploads/hero-desktop.webp" media="(min-width: 768px)">
<link rel="preload" as="image" href="/wp-content/uploads/hero-mobile.webp" media="(max-width: 767px)">
```
Product pages (PHP, Code Snippets) - preload the WooCommerce main image:
```php
add_action( 'wp_head', function () {
    if ( ! function_exists( 'is_product' ) || ! is_product() ) { return; }
    $id = get_post_thumbnail_id( get_queried_object_id() );
    if ( ! $id ) { return; }
    $src    = wp_get_attachment_image_src( $id, 'woocommerce_single' );
    $srcset = wp_get_attachment_image_srcset( $id, 'large' );
    printf( '<link rel="preload" as="image" href="%s" imagesrcset="%s" imagesizes="(max-width: 600px) 100vw, 600px" fetchpriority="high">' . "\n",
        esc_url( $src[0] ), esc_attr( $srcset ) );
}, 3 );
```
Blog posts (PHP) - stop WP Rocket from lazy-loading the Elementor featured-image widget:
```php
add_filter( 'rocket_buffer', function ( $html ) {
    if ( ! is_singular( 'post' ) || ! has_post_thumbnail() ) { return $html; }
    return preg_replace( '#(data-widget_type="theme-post-featured-image\.default"[^>]*>.*?<img)#is', '$1 data-no-lazy="1"', $html, 1 );
} );
```
**C. Ultra-light placeholder for the mobile hero background** (header CSS; replace the selector and the data URI with a 1-3 KB blurred version of the image)
```html
<style>
@media (max-width: 767px) {
  .hero-bg { animation: hero-placeholder 1.5s ease-in-out 2s backwards; }
}
@keyframes hero-placeholder { from { background-image: url("data:image/jpeg;base64,REPLACE_ME"); } }
</style>
```
**D. Submenu arrows missing until interaction (Elementor, delayed JS)**
```html
<script data-wpmeteor-nooptimize="true">
// $( nowprocket
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.menu-item-has-children > a.elementor-item').forEach(function (link) {
    link.insertAdjacentHTML('beforeend', '<span class="sub-arrow early-arrow"><i class="fas fa-caret-down"></i></span>');
  });
  var css = document.createElement('style');
  css.textContent = '.elementor-item.has-submenu .early-arrow{display:none}';
  document.head.appendChild(css);
});
</script>
```
**E. Mobile menu needs two taps (Elementor, delayed JS)**
```html
<script data-wpmeteor-nooptimize="true">
// $( nowprocket
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.elementor-location-header .elementor-menu-toggle');
  var menu = document.querySelector('.elementor-location-header nav.elementor-nav-menu--dropdown');
  if (!toggle || !menu) { return; }
  toggle.addEventListener('click', function () {
    // only while scripts are still delayed (WP Rocket: rocketlazyloadscript, WP Meteor: javascript/blocked)
    if (document.querySelector('script[type="rocketlazyloadscript"], script[type="javascript/blocked"]')) {
      toggle.classList.add('elementor-active');
      menu.style.cssText = 'width:100vw;top:60px;';
    }
  });
});
</script>
```
**F. Sticky header without JS** (give the header section the ID `site-sticky-header`, set the padding to the header height)
```html
<style>
#site-sticky-header { position: fixed; top: 0; left: 0; right: 0; z-index: 99; }
body { padding-top: 120px; }
</style>
```
**G. Exclude one script from delay on one page only (PHP)**
```php
add_filter( 'rocket_delay_js_exclusions', function ( $list ) {
    $path = isset( $_SERVER['REQUEST_URI'] ) ? rtrim( parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH ), '/' ) : '';
    if ( in_array( $path, array( '/page-slug' ), true ) ) { $list[] = 'script-name-to-keep'; }
    return $list;
} );
```
**H. Contact Form 7 refill** - must run after CF7's own script (footer):
```html
<script>
// $( nowprocket
if (window.wpcf7) { wpcf7.cached = 0; }
</script>
```
**I. Mobile background override**
```html
<style>
@media (max-width: 767px) {
  .hero-section { background-image: url(/wp-content/uploads/hero-mobile.webp) !important; }
  .desktop-only-section { background-image: none !important; }
}
@media (min-width: 768px) { .mobile-only-section { background-image: none !important; } }
</style>
```
**J. Responsive image**
```html
<picture>
  <source media="(max-width: 767px)" srcset="/wp-content/uploads/photo-small.webp">
  <source media="(min-width: 768px)" srcset="/wp-content/uploads/photo-large.webp">
  <img src="/wp-content/uploads/photo-large.webp" alt="DESCRIBE" width="1200" height="800">
</picture>
```
**K. Lazy-load below-the-fold background images (Elementor)** - backgrounds stay off until the first interaction or 8 s; the first two sections are left alone:
```html
<script>
// $( nowprocket
(function () {
  var done = false;
  function wake() { if (done) return; done = true; document.documentElement.classList.add('bg-ready'); }
  setTimeout(wake, 8000);
  ['mouseover', 'keydown', 'touchstart', 'touchmove', 'wheel', 'scroll'].forEach(function (e) { window.addEventListener(e, wake, { passive: true, once: true }); });
})();
</script>
<style>
html:not(.bg-ready) .elementor-section:not(:nth-child(-n+2)),
html:not(.bg-ready) .elementor-section:not(:nth-child(-n+2)) .elementor-background-overlay,
html:not(.bg-ready) .elementor-column-wrap,
html:not(.bg-ready) .e-gallery-image,
html:not(.bg-ready) .elementor-cta__bg,
html:not(.bg-ready) .elementor-flip-box__front,
html:not(.bg-ready) .elementor-location-footer .elementor-section { background-image: none !important; }
</style>
```
**L. Google font limited to specific characters**
```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@700&display=swap&text=YOURHEADINGTEXT">
```
**M. Point an icon Elementor doesn't expose to the custom icon font**
```css
.fa-search:before { content: "\e801"; font-family: "my-icons"; }
[class^="icon-"], [class*=" icon-"] { font-style: normal; }
```
(Copy the exact `content` value of each icon from the custom set by inspecting its `::before`; add `!important` if the theme's rule wins.)
**N. Preconnect**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```
