interface CloudflareEnv {
  API: import('@cloudflare/workers-types').Fetcher;
  APP_ENV: string;
  PUBLIC_BETA_FRONTEND?: string;
}
