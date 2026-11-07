import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DockerSandboxClient } from '@openai/agents/sandbox/local';
import type { Config } from '@greenci/core';
import { SdkAgentProvider } from './sdk.js';
export async function createLocalAgentProvider(
  config: Config,
  available: () => Promise<boolean> = async () => {
    try {
      await promisify(execFile)(
        'docker',
        ['info', '--format', '{{.ServerVersion}}'],
        { timeout: 2000, maxBuffer: 1024 },
      );
      return true;
    } catch {
      return false;
    }
  },
) {
  if (config.APP_ENV !== 'local')
    throw new Error('Local sandbox selection is local-only');
  if (
    config.AGENT_PROVIDER === 'fake' ||
    config.SANDBOX_CLIENT === 'cloudflare'
  )
    return new SdkAgentProvider(config);
  if (config.SANDBOX_CLIENT === 'fake')
    return new SdkAgentProvider({ ...config, AGENT_PROVIDER: 'fake' });
  if (await available())
    return new SdkAgentProvider(
      config,
      new DockerSandboxClient({ image: 'node:22', networkMode: 'none' }),
    );
  return new SdkAgentProvider({
    ...config,
    AGENT_PROVIDER: 'fake',
    SANDBOX_CLIENT: 'fake',
  });
}
