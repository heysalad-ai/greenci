import { WarmPool as BaseWarmPool } from '@cloudflare/sandbox/bridge';
/** Coalesce concurrent manifest requests for the same session without widening pool capacity. */
export class BetaWarmPool extends BaseWarmPool {
  override async configure(config: Parameters<BaseWarmPool['configure']>[0]) {
    const stats = await super.getStats();
    if (
      stats.total === 0 &&
      stats.maxInstances === 0 &&
      (config.maxInstances ?? 0) > 0
    ) {
      // SDK 0.12.14 persists a zero ceiling after transient platform exhaustion.
      // Retry only an empty pool, under the operator's unchanged declared cap.
      Object.assign(this, {
        knownMaxInstances: null,
        capacityExhausted: false,
      });
      await this.ctx.storage.delete('knownMaxInstances');
    }
    await super.configure(config);
  }
  private readonly starting = new Map<string, Promise<string>>();
  override getContainer(id: string): Promise<string> {
    const current = this.starting.get(id);
    if (current) return current;
    const pending = super
      .getContainer(id)
      .finally(() => this.starting.delete(id));
    this.starting.set(id, pending);
    return pending;
  }
}

/** Fresh namespace after reclaiming probe instances; old namespaces retain their alarms. */
export class GreenCIPool extends BetaWarmPool {}
