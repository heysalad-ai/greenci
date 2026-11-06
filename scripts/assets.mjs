import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const destination = fileURLToPath(new URL('apps/web/public/brand', root));
mkdirSync(destination, { recursive: true });
cpSync(fileURLToPath(new URL('design-system/assets/', root)), destination, {
  recursive: true,
});
