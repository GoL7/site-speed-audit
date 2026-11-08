#!/usr/bin/env node
// Repeatable Lighthouse lab runs with a median, plus an optional performance budget check.
// Usage:
//   node scripts/lighthouse_runs.mjs https://example.com/                 # 3 mobile runs (run from the skill folder)
//   node scripts/lighthouse_runs.mjs https://example.com/ --desktop --runs 5
//   node scripts/lighthouse_runs.mjs https://example.com/ --budget assets/budget.json
// Needs Node 18+ and a Chrome/Chromium. Set CHROME_PATH if Chrome isn't found automatically.
// Note: the run happens from THIS machine's location - it does not show the distance cost for
// visitors in another country (see references/server-location.md).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const url = args.find(a => /^https?:\/\//.test(a));
if (!url) { console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 9).join('\n')); process.exit(1); }
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const runs = Number(opt('--runs') || 3);
const desktop = args.includes('--desktop');
const budgetPath = opt('--budget');

for (const p of ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome']) {
  if (!process.env.CHROME_PATH && existsSync(p)) process.env.CHROME_PATH = p;
}

const dir = mkdtempSync(join(tmpdir(), 'lh-'));
const results = [];
for (let i = 1; i <= runs; i++) {
  const out = join(dir, `run${i}.json`);
  const flags = ['-y', 'lighthouse@12', url, '--only-categories=performance', '--output=json', `--output-path=${out}`, '--quiet',
    '--chrome-flags=--headless=new --no-sandbox --disable-gpu'];
  if (desktop) flags.push('--preset=desktop');
  try {
    execFileSync('npx', flags, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000 });
    const lhr = JSON.parse(readFileSync(out, 'utf8'));
    const a = lhr.audits;
    const n = k => (a[k] && a[k].numericValue) || 0;
    const r = {
      score: Math.round((lhr.categories.performance.score || 0) * 100),
      fcp: n('first-contentful-paint'), lcp: n('largest-contentful-paint'), tbt: n('total-blocking-time'),
      cls: n('cumulative-layout-shift'), si: n('speed-index'), ttfb: n('server-response-time'),
      bytes: n('total-byte-weight'),
      js: ((a['resource-summary'] && a['resource-summary'].details && a['resource-summary'].details.items) || []).find(x => x.resourceType === 'script')?.transferSize || 0,
      lcpEl: a['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.snippet || '',
      failing: Object.values(a).filter(x => x.score !== null && x.score < 0.9 && ['numeric', 'binary', 'metricSavings'].includes(x.scoreDisplayMode)).map(x => `${x.title} ${x.displayValue || ''}`.trim()),
    };
    results.push(r);
    console.log(`run ${i}: score ${r.score} | LCP ${(r.lcp / 1000).toFixed(2)} s | TBT ${Math.round(r.tbt)} ms | CLS ${r.cls.toFixed(3)}`);
  } catch (e) {
    console.log(`run ${i}: failed - ${String(e.stderr || e.message).split('\n').slice(-3).join(' ')}`);
  }
}
if (!results.length) { console.log('No successful run. Use pagespeed.web.dev instead.'); process.exit(2); }

const med = k => { const v = results.map(r => r[k]).sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
const m = { score: med('score'), fcp: med('fcp'), lcp: med('lcp'), tbt: med('tbt'), cls: med('cls'), si: med('si'), ttfb: med('ttfb'), bytes: med('bytes'), js: med('js') };
const byScore = [...results].sort((x, y) => x.score - y.score)[Math.floor(results.length / 2)];
console.log(`\n## Median of ${results.length} ${desktop ? 'desktop' : 'mobile'} runs (from this machine's location)`);
console.log(`Score ${m.score} | FCP ${(m.fcp / 1000).toFixed(2)} s | LCP ${(m.lcp / 1000).toFixed(2)} s | TBT ${Math.round(m.tbt)} ms | CLS ${m.cls.toFixed(3)} | Speed Index ${(m.si / 1000).toFixed(2)} s | server response ${Math.round(m.ttfb)} ms`);
console.log(`Total ${Math.round(m.bytes / 1024)} KB, JS ${Math.round(m.js / 1024)} KB (compressed)`);
console.log(`LCP element: ${byScore.lcpEl.slice(0, 200)}`);
console.log('Failing audits (median run):'); byScore.failing.forEach(f => console.log(`  - ${f}`));

if (budgetPath) {
  const b = JSON.parse(readFileSync(budgetPath, 'utf8'));
  const checks = [
    ['LCP', m.lcp, b.lcp_ms, 'ms'], ['TBT', m.tbt, b.tbt_ms, 'ms'], ['CLS', m.cls, b.cls, ''], ['FCP', m.fcp, b.fcp_ms, 'ms'],
    ['Total KB', m.bytes / 1024, b.total_kb, 'KB'], ['JS KB', m.js / 1024, b.js_kb, 'KB'], ['Score', m.score, b.min_score, '', true],
  ].filter(c => c[2] !== undefined);
  console.log(`\n## Budget (${budgetPath})`);
  let fail = 0;
  for (const [name, val, lim, unit, min] of checks) {
    const ok = min ? val >= lim : val <= lim; if (!ok) fail++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: ${name === 'CLS' ? val.toFixed(3) : Math.round(val)}${unit} (${min ? 'min' : 'max'} ${lim}${unit})`);
  }
  process.exit(fail ? 3 : 0);
}
