import '../apps/web/cloudflare-env.d.ts';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ mode: 'false' }));
vi.mock('../apps/web/node_modules/next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect ${path}`);
  },
}));
vi.mock('../apps/web/node_modules/@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { PUBLIC_BETA_FRONTEND: state.mode } }),
}));
import { GET } from '../apps/web/src/app/api/beta-mode/route.js';
import Home from '../apps/web/src/app/page.js';
import StartLayout from '../apps/web/src/app/start/layout.js';
it.each(['true', 'false', 'unexpected'])(
  'exposes only the current frontend signup mode: %s',
  async (mode) => {
    state.mode = mode;
    const response = GET();
    expect(await response.json()).toEqual({ publicSignup: mode === 'true' });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  },
);
it('routes public root and legacy onboarding to signup while retaining local onboarding', () => {
  state.mode = 'true';
  expect(() => Home()).toThrow('redirect /beta');
  expect(() => StartLayout({ children: 'fixture' })).toThrow('redirect /beta');
  state.mode = 'false';
  expect(StartLayout({ children: 'fixture' })).toBe('fixture');
});
