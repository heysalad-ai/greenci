import { readFileSync } from 'node:fs';
import { parse } from 'jsonc-parser';
const environment = process.argv[2];
if (!['dev', 'staging', 'production'].includes(environment))
  throw new Error('Choose an explicit deployment environment');
for (const app of ['api', 'web', 'sandbox']) {
  const config = parse(readFileSync(`apps/${app}/wrangler.jsonc`, 'utf8'));
  const target = config.env?.[environment];
  if (!target || /TODO\(/.test(JSON.stringify(target)))
    throw new Error(`Configure ${environment} resource IDs before deployment`);
}
console.log(`Configuration checked for ${environment}`);
