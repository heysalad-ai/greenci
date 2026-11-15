import { Sandbox as BaseSandbox } from '@cloudflare/sandbox';
import worker from './bridge.js';
import { BetaWarmPool, GreenCIPool } from './beta-pool.js';
/** The beta materializes a safe snapshot; no credential or network is needed inside the container. */
export class Sandbox extends BaseSandbox {
  enableInternet = false;
}
export { BetaWarmPool, GreenCIPool };
// Retain the prior namespace for its existing alarms; new sessions use BetaWarmPool.
export { WarmPool } from '@cloudflare/sandbox/bridge';
export { ContainerProxy } from '@cloudflare/sandbox';
export default worker;
