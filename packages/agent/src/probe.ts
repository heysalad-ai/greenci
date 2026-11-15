import { CloudflareSandboxClient } from '@openai/agents-extensions/sandbox/cloudflare';
import { Manifest, file } from '@openai/agents/sandbox';
import type { Config } from '@greenci/core';
import { z } from 'zod';

/** An explicit operator acceptance probe, never part of the offline test suite. No repository data is sent. */
export async function probeBetaProviders(config: Config) {
  if (
    config.APP_ENV !== 'dev' ||
    config.BETA_ENABLED !== 'true' ||
    config.AGENT_PROVIDER !== 'openai' ||
    config.SANDBOX_CLIENT !== 'cloudflare'
  )
    throw new Error('Live provider probes require the private dev beta');
  const cyberModel = /-cyber(?:$|-)/.test(config.OPENAI_AGENT_MODEL);
  if (
    cyberModel &&
    (config.OPENAI_CYBER_READY !== 'true' ||
      config.OPENAI_CYBER_PROGRAM !== 'daybreak_red')
  )
    throw new Error(
      'Cyber access and deployment requirements must be confirmed before probing',
    );
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.OPENAI_AGENT_MODEL,
      ...(config.OPENAI_CYBER_PROGRAM
        ? { access_programs: { cyber: config.OPENAI_CYBER_PROGRAM } }
        : {}),
      input: 'Reply with READY only.',
      max_output_tokens: 128,
      reasoning: { effort: 'low' },
      store: false,
      safety_identifier: 'greenci-private-beta-owner',
    }),
  });
  console.info('Beta model probe HTTP status:', response.status);
  if (!response.ok)
    throw new Error(`OpenAI model probe failed (${response.status})`);
  const result = z
    .object({
      status: z.literal('completed'),
      output: z.array(
        z.object({
          type: z.string(),
          content: z
            .array(z.object({ type: z.string(), text: z.string().optional() }))
            .optional(),
        }),
      ),
    })
    .parse(await response.json());
  if (
    !result.output.some((item) =>
      item.content?.some(
        (content) =>
          content.type === 'output_text' && content.text?.trim() === 'READY',
      ),
    )
  )
    throw new Error('OpenAI model probe did not complete');
  console.info('Beta model probe completed');
  const cyber = await fetch('https://api.openai.com/v1/models/gpt-6-cyber', {
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}` },
  });
  console.info('Beta Cyber visibility HTTP status:', cyber.status);
  const client = new CloudflareSandboxClient({
    workerUrl: config.CLOUDFLARE_SANDBOX_WORKER_URL,
    apiKey: config.CLOUDFLARE_SANDBOX_API_KEY,
    timeouts: { execTimeoutMs: 10_000, requestTimeoutMs: 90_000 },
  });
  console.info('Beta sandbox probe: create');
  const sandbox = await client
    .create(
      new Manifest({
        entries: {
          'probe.mjs': file({
            content: "console.log('__GREENCI_NODE_READY__');",
          }),
          'network.mjs': file({
            content:
              "import net from 'node:net'; const done = () => { socket.destroy(); console.log('__GREENCI_SANDBOX_READY__'); process.exit(0); }; const socket = net.connect({host:'1.1.1.1',port:443}); const timer = setTimeout(done, 3000); socket.on('connect',()=>{clearTimeout(timer);socket.destroy();process.exit(1);}); socket.on('error',()=>{clearTimeout(timer);done();});",
          }),
        },
      }),
    )
    .catch((error: unknown) => {
      // SDK diagnostics only: never emit request/response bodies or credentials.
      const detail = error as {
        name?: string;
        operation?: string;
        status?: number;
        statusCode?: number;
        message?: string;
        details?: { operation?: string; status?: number };
      };
      console.warn('Beta sandbox create rejected', {
        name: detail.name,
        kind: detail.message?.includes('no longer running')
          ? 'remote-not-running'
          : detail.message?.includes('PTY')
            ? 'pty'
            : detail.message?.includes('instance limit')
              ? 'capacity'
              : 'other',
        operation: detail.operation ?? detail.details?.operation,
        status: detail.status ?? detail.statusCode ?? detail.details?.status,
        message: detail.message?.startsWith('CloudflareSandboxClient')
          ? detail.message.split(':')[0]
          : undefined,
      });
      throw error;
    });
  try {
    console.info('Beta sandbox probe: execute');
    const node = await sandbox.execCommand({
      cmd: 'node /workspace/probe.mjs',
      maxOutputTokens: 200,
    });
    console.info('Beta Node execution probe:', node);
    if (
      !/^Process exited with code 0$/m.test(node) ||
      node.split('Output:\n')[1]?.trim() !== '__GREENCI_NODE_READY__'
    )
      throw new Error('Sandbox Node execution probe failed');
    const output = await sandbox.execCommand({
      cmd: 'node /workspace/network.mjs',
      maxOutputTokens: 200,
    });
    if (
      !/^Process exited with code 0$/m.test(output) ||
      output.split('Output:\n')[1]?.trim() !== '__GREENCI_SANDBOX_READY__'
    ) {
      console.warn('Fixed sandbox probe output:', output.slice(0, 1000));
      throw new Error('Sandbox execution or denied-network probe failed');
    }
  } finally {
    await sandbox.delete();
  }
  console.info('Beta sandbox execution and denied-network probe completed');
  return {
    openai: 'verified',
    sandbox: 'verified',
    deniedNetworkProbe: true,
    cyberModelVisible: cyber.status === 200,
    cyberVisibilityStatus: cyber.status,
    cyberInferenceVerified: cyberModel,
  };
}
