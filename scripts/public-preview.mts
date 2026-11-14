import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { copy, screenCopy } from '../packages/core/src/index.js';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const output = '.data/public-preview/assets';
mkdirSync(`${output}/screens`, { recursive: true });
const p = copy.publicPreview;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
const css =
  [
    'design-system/tokens.css',
    'design-system/components.css',
    'apps/web/src/app/fonts.css',
  ]
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n') +
  `
body{margin:0;background:var(--surface);color:var(--ink);font-family:var(--font-sans)}
a{color:var(--brand-ink);text-underline-offset:3px}a:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.preview-notice{padding:var(--space-4) var(--space-6);background:var(--surface-raised);color:var(--ink);font-size:14px;line-height:1.5;border-bottom:1px solid var(--line)}
.preview-page{max-width:1200px;margin:auto;padding:var(--space-6)}.preview-page p{max-width:70ch;line-height:1.6}
.preview-page figure{margin:var(--space-8) 0}.preview-page img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:var(--radius-lg)}.preview-page figcaption{margin-top:var(--space-3);line-height:1.6}
@media(max-width:600px){.preview-page,.preview-notice{padding:var(--space-4)}}
`;
writeFileSync(`${output}/styles.css`, css);
cpSync('apps/web/public/brand', `${output}/brand`, { recursive: true });
cpSync('apps/web/public/fonts', `${output}/fonts`, { recursive: true });
for (const screen of p.screens)
  cpSync(`docs/fidelity/${screen.file}`, `${output}/screens/${screen.file}`);
const notice = `<aside class="preview-notice">${escape(p.notice)} <a href="/preview">${escape(p.open)}</a></aside>`;
const document = (body: string, title: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><meta name="description" content="${escape(p.detail)}"><link rel="icon" href="/brand/logos/greenci-favicon.svg"><link rel="stylesheet" href="/styles.css"></head><body>${notice}${body}</body></html>`;
let landing = screenCopy.landingHtml.replace(
  /<section\b[^>]*>[\s\S]*?<\/section>/g,
  (section) => {
    if (section.includes('[CUSTOMER QUOTE:')) return '';
    if (section.includes('id="pricing"'))
      return `<section id="pricing" class="preview-page"><h2>${escape(p.plans)}</h2><p>${escape(p.planDetail)}</p><p>${escape(p.availability)}</p><a class="gc-btn gc-btn--primary" href="/preview">${escape(p.open)}</a></section>`;
    return section;
  },
);
landing = landing
  .replace(
    'When a GitHub check fails, press Diagnose. GreenCI finds the cause, writes the fix and proves it by re-running every check, then hands you a pull request to review.',
    escape(p.detail),
  )
  .replace(
    'Ships [SHIP DATE] · Works with GitHub Actions · Never pushes to main',
    escape(p.availability),
  )
  .replaceAll('Order a deck · [PRICE]', escape(p.open))
  .replaceAll('Order a deck', escape(p.open))
  .replaceAll('Watch a 20s run', escape(p.flow))
  .replaceAll('>Pricing</a>', `>${escape(p.plans)}</a>`)
  .replace(/href="\/start(?:\?[^" ]*)?"/g, 'href="/preview"')
  .replace(/href="#pricing"(?=[^>]*>View product preview)/g, 'href="/preview"')
  .replace('>Docs</a>', `>${escape(p.docs)}</a>`)
  .replace(/href="\/preview"(?=[^>]*>About this preview)/, 'href="/docs"');
if (/\[(?:PRICE|SHIP DATE|RUNS|CUSTOMER|NAME|ROLE|COMPANY)/.test(landing))
  throw new Error('Unresolved public marketing placeholder');
if (/<script\b|fonts.googleapis.com|https:\/\//.test(landing))
  throw new Error('Public preview must be self-contained');
writeFileSync(
  `${output}/index.html`,
  document(`<main>${landing}</main>`, p.title),
);
const gallery = `<main class="preview-page"><a href="/">${escape(p.home)}</a><h1 class="display-l">${escape(p.galleryTitle)}</h1><p>${escape(p.galleryDetail)}</p>${p.screens.map((screen) => `<figure><a href="/screens/${screen.file}"><img loading="lazy" src="/screens/${screen.file}" alt="${escape(screen.title)}"></a><figcaption><strong>${escape(screen.title)}</strong> — ${escape(screen.detail)}</figcaption></figure>`).join('')}</main>`;
writeFileSync(`${output}/preview.html`, document(gallery, p.galleryTitle));
writeFileSync(
  `${output}/docs.html`,
  document(
    `<main class="preview-page"><a href="/">${escape(p.home)}</a><h1 class="display-l">${escape(p.docs)}</h1><section id="safety"><p id="progress">${escape(p.docsDetail)}</p></section><a href="/preview">${escape(p.open)}</a></main>`,
    p.docs,
  ),
);
writeFileSync(`${output}/robots.txt`, 'User-agent: *\nDisallow: /\n');
console.log(
  'Built read-only public preview: landing, product captures, local assets and no backend bindings.',
);
