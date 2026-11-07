import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const destination = fileURLToPath(new URL('apps/web/public/brand', root));
mkdirSync(destination, { recursive: true });
cpSync(fileURLToPath(new URL('design-system/assets/', root)), destination, {
  recursive: true,
});

const fontDestination = fileURLToPath(new URL('apps/web/public/fonts/', root));
mkdirSync(fontDestination, { recursive: true });
for (const name of ['bricolage-grotesque', 'geist', 'geist-mono']) {
  const packageRoot = new URL(
    `apps/web/node_modules/@fontsource-variable/${name}/`,
    root,
  );
  copyFileSync(
    fileURLToPath(
      new URL(`files/${name}-latin-wght-normal.woff2`, packageRoot),
    ),
    `${fontDestination}/${name}.woff2`,
  );
  copyFileSync(
    fileURLToPath(new URL('LICENSE', packageRoot)),
    `${fontDestination}/${name}-LICENSE.txt`,
  );
}
const previews = fileURLToPath(new URL('apps/web/public/references', root));
mkdirSync(previews, { recursive: true });
for (const name of readdirSync(new URL('design-system/components/', root))) {
  if (name === 'Cover') continue;
  const source = readFileSync(
    new URL(`design-system/components/${name}/preview.html`, root),
    'utf8',
  );
  const css =
    ['tokens.css', 'components.css']
      .map((name) =>
        readFileSync(new URL(`design-system/${name}`, root), 'utf8'),
      )
      .join('\n') +
    '\n' +
    readFileSync(new URL('apps/web/src/app/fonts.css', root), 'utf8');
  writeFileSync(
    `${previews}/${name}.html`,
    source
      .replace('</head>', `<style>${css}</style></head>`)
      .replaceAll('../../assets/', '/brand/'),
  );
}
