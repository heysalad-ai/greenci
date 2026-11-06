export interface ApiEnv {
  [key: string]: unknown;
  DB: D1Database;
  SESSIONS: KVNamespace;
  ARTIFACTS: R2Bucket;
  EVENTS: Queue;
  ORG_ROOMS: DurableObjectNamespace;
  DECK_SESSIONS: DurableObjectNamespace;
  RUN_WORKFLOW: Workflow<{ requiresApproval: boolean }>;
  SANDBOX_SERVICE: Fetcher;
}
