# Platforms - how to recognize them and what a prompt can change

| Platform | How to recognize (collector "Platform signals") | Stack | What prompts can change | Limits |
|---|---|---|---|---|
| Lovable | `/~flock.js`, `/__l5e/`, `gpt-engineer-file-uploads` images, `/assets/index-[hash].js` | Vite + React + TypeScript + Tailwind + shadcn, client-side rendered SPA | All code: index.html, components, images in /public or src/assets, vite config, fonts | Hosting headers and CDN are Lovable's (behind Cloudflare). Custom cache rules only via the owner's own Cloudflare on the custom domain. Platform analytics/badge scripts are injected by the host. Build-time prerender needs a build step that works in their build environment - verify it builds. |
| Claude (Claude Code / artifacts) | Whatever stack was generated - usually Vite/React or Next.js; check the repo | Any | Everything, including hosting config files (vercel.json, netlify _headers) | Depends on where it is hosted |
| Base44 | `base44` in HTML/requests | React app on Base44 hosting | Components, images, fonts, scripts | Little control over hosting, headers, build config, SSR |
| Bolt (bolt.new) | StackBlitz/Bolt traces; often Netlify hosting | Vite/React or Next.js | Code + `public/_headers` / netlify.toml when on Netlify | Depends on host |
| v0 / Vercel | `/_next/static`, `__NEXT_DATA__`, `x-vercel-cache` header | Next.js | Server/static rendering, next/image, next/font, vercel.json headers | Mostly none - Next.js already supports SSR/SSG, so R1 becomes "stop making pages client-only" |
| Replit | `replit` domains | Varies (often Vite/Express) | Code, server headers in Express | Hosting plan speed |
| Webflow / Wix / Framer | `webflow`, `wixstatic`, `framer` | Hosted builders | Image uploads, fonts, custom code embeds, removing apps/embeds | No code-level control; prompts don't apply - give manual steps |
| WordPress | `wp-content` | PHP | Use `wordpress.md` (plugin/snippet fixes) | - |

## Writing prompts for builders
- One prompt per fix group, ordered by impact; tell the owner to apply them one at a time and republish between them, so a regression is easy to trace.
- Include the evidence in the prompt (file names, sizes, selectors) - builders act more precisely on concrete facts.
- Always end with the guard line (no design/content changes, build must pass).
- For Lovable: images the AI generated often live in `src/assets` and get hashed names - ask to convert them in place and keep the imports working. Images uploaded by the user live in `public/` or on `gpt-engineer-file-uploads` storage.
- After the owner applies a prompt, rerun the collector - never assume the builder did it right.

## Where they serve from (check, don't assume)
Platforms change their infrastructure; always confirm with the headers and a measurement from the visitors' country (`server-location.md`).
- **Lovable** (`*.lovable.app` and custom domains) - behind Cloudflare. Look at `cf-cache-status` on the HTML from the visitors' country: `HIT` = served locally, `DYNAMIC`/`MISS` = from the origin. Lovable Cloud = Supabase; its region decides G2.
- **Vercel** (v0, many Claude/Cursor/Bolt projects) - `x-vercel-id` shows the edge region (and function region). Its published region list has no region in Israel; check vercel.com/docs/regions for the current list. Functions run in one chosen region (default US East) unless configured.
- **Netlify** - `server: Netlify`; location isn't in the headers - measure from the country.
- **Base44** - front end and backend on Base44's infrastructure; measure the page and the API requests from the country.
- **Replit / Railway / Fly / Render** - region in the deployment settings (`x-railway-edge`, `fly-request-id` suffix).
- **Own server / VPS / shared hosting** - IP geolocation of the server works when there is no CDN in front.

If the owner moves the front end to a host in the visitors' country, the build output is the same: Vite -> `npm run build` -> `dist`; Next.js needs a host that runs Next.js server features, or a static export for fully static sites.
