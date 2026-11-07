import { readFileSync, writeFileSync } from 'node:fs';
import { format } from 'prettier';
// Trusted, committed screen markup only. No user input enters this HTML adapter.
let body = readFileSync('design/static/Landing.html', 'utf8')
  .split('<body>')[1]
  .split('</body>')[0];
body = body
  .replaceAll('../../design-system/assets/', '/brand/')
  .replace(/<link[^>]+fonts.googleapis.com[^>]*>/g, '');
body = body.replace(
  '<h2 style="margin: 0; font: 700 clamp(32px, 4vw, 44px)/1.05 var(--font-display); letter-spacing: -.02em">Pick a deck</h2>',
  '<h2 style="margin: 0; font: 700 clamp(32px, 4vw, 44px)/1.05 var(--font-display); letter-spacing: -.02em">Works without the deck. Better with it.</h2>',
);
const marker =
  '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px">';
const pricingIndex = body.indexOf('<section id="pricing"');
const beforePricing = body.slice(0, pricingIndex);
let pricing = body.slice(pricingIndex);
pricing = pricing.replace(
  marker,
  marker +
    '<div style="background: var(--deck); color: var(--on-deck); border:1px solid var(--line-strong); border-radius:var(--radius-lg); padding:var(--space-5); display:flex; flex-direction:column; gap:var(--space-4)"><span class="label">Software only</span><span class="display-l">[PRICE]</span><p>Works without the deck. Better with it.</p><a class="gc-btn gc-btn--primary" href="/start?deckless=1">Continue without a deck</a></div>',
);
body = beforePricing + pricing;
// Unconfigured commerce retains explicit placeholders; route CTAs to onboarding, never invent checkout or sales claims.
body = body
  .replaceAll('href="#"', 'href="/start"')
  .replaceAll('href="/start">Docs', 'href="/docs">Docs')
  .replace('href="/start">Security', 'href="/docs#safety">Security')
  .replace('href="/start">Changelog', 'href="/docs#progress">Changelog')
  .replace('href="/start">Status', 'href="/healthz">Status')
  .replace(
    'href="/start">Press kit',
    'href="/brand/logos/greenci-logo.svg">Press kit',
  );
body = body.replace(
  '</style>',
  '.gc-btn--primary:hover{color:var(--on-action)}a:focus-visible{outline:2px solid var(--focus);outline-offset:2px} html{scroll-behavior:smooth}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}</style>',
);
const marketing = JSON.parse(
  readFileSync('packages/core/src/marketing.json', 'utf8'),
);
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  );
for (const [placeholder, key] of Object.entries({
  '[PRICE]': 'price',
  '[SHIP DATE]': 'shipDate',
  '[RUNS]': 'runs',
  '[CUSTOMER QUOTE: one sentence about a real fix GreenCI made for them]':
    'quote',
  '[NAME]': 'customerName',
  '[ROLE]': 'customerRole',
  '[COMPANY]': 'customerCompany',
}))
  body = body.replaceAll(placeholder, escape(marketing[key]));
writeFileSync(
  'packages/core/src/screens.ts',
  await format(
    `// Generated from the trusted Landing reference by scripts/screens.mjs.\nexport const screenCopy = {landingHtml:${JSON.stringify(body)}} as const;\n`,
    { parser: 'typescript', singleQuote: true },
  ),
);
