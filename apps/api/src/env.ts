export interface ApiEnv {
  [key: string]: unknown;
  AUTH_EMAIL?: {
    send(message: {
      from: { email: string; name: string };
      to: string;
      subject: string;
      text: string;
    }): Promise<unknown>;
  };
  DB: D1Database;
  SESSIONS: KVNamespace;
  ARTIFACTS: R2Bucket;
  EVENTS: Queue;
  ORG_ROOMS: DurableObjectNamespace;
  DECK_SESSIONS: DurableObjectNamespace;
  RUN_WORKFLOW: Workflow<{
    requiresApproval?: boolean;
    runId?: string;
    dashboard?: boolean;
  }>;
  SANDBOX_SERVICE: Fetcher;
  DEVICE_SERVICE?: Fetcher;
}
