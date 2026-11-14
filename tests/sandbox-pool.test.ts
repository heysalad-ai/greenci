import { it, expect } from 'vitest';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

it.each([false, true])(
  'starts one container per session and recovers an empty exhausted pool: %s',
  async (recover) => {
    const entry = fileURLToPath(
      new URL('../apps/sandbox/src/beta-pool.ts', import.meta.url),
    );
    const bundle = await build({
      stdin: {
        contents: `
    import {BetaWarmPool as WarmPool} from ${JSON.stringify(entry)};
    import {DurableObject} from 'cloudflare:workers';
    export {WarmPool};
    export class FixtureFlag extends DurableObject {failed=false; async consume(){const first=!this.failed;this.failed=true;return first;}}
    export class FixtureSandbox extends DurableObject {
      running = false;
      async startAndWaitForPorts(){if(this.env.RECOVER === 'true' && await this.env.FLAG.get(this.env.FLAG.idFromName('once')).consume()) throw new Error('Maximum number of running container instances exceeded'); await new Promise(resolve => setTimeout(resolve,40)); this.running=true;}
      async getState(){return {status:this.running?'running':'stopped'};}
      async stop(){this.running=false;}
      async renewActivityTimeout(){}
    }
    export default {async fetch(request,env){
      const pool=env.WARM_POOL.get(env.WARM_POOL.idFromName('fixture-pool'));
      await pool.configure({maxInstances:1,warmTarget:0});
      if(env.RECOVER === 'true'){try{await pool.getContainer('fixture');}catch{} await pool.configure({maxInstances:1,warmTarget:0});}
      const ids=await Promise.all([pool.getContainer('fixture'),pool.getContainer('fixture'),pool.getContainer('fixture')]);
      return Response.json({unique:new Set(ids).size,stats:await pool.getStats()});
    }};`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      external: ['node:*', 'cloudflare:*'],
      write: false,
    });
    const runtime = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: bundle.outputFiles[0]!.text,
        compatibilityDate: '2026-11-06',
        compatibilityFlags: ['nodejs_compat'],
        bindings: { RECOVER: String(recover) },
        durableObjects: {
          Sandbox: 'FixtureSandbox',
          WARM_POOL: 'WarmPool',
          FLAG: 'FixtureFlag',
        },
      }),
    );
    try {
      const response = await runtime.dispatchFetch('https://fixture/');
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        unique: 1,
        stats: { assigned: 1, total: 1 },
      });
    } finally {
      await runtime.dispose();
    }
  },
);
