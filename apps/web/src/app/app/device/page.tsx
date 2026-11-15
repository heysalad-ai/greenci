'use client';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { copy } from '@greenci/core';
import { Button, Banner } from '@greenci/ui';
import { SideNav, TopBar } from '../shell';
import shell from '../app.module.css';
import styles from './device.module.css';

const heartbeat = z.object({
  firmware: z.string(),
  slot: z.string(),
  ack: z.number(),
  result: z.string(),
  led1: z.number(),
  led4: z.number(),
  healthy: z.boolean(),
  seenAt: z.number(),
  battery: z
    .object({
      millivolts: z.number().min(0).max(10000),
      percent: z.number().min(0).max(100).nullable(),
      nominalMah: z.number().positive(),
      method: z.literal('voltage_estimate'),
    })
    .optional(),
});
const responseSchema = z.object({
  status: heartbeat.nullable(),
  pending: z.object({ seq: z.number() }).passthrough().nullable(),
});
type DeviceState = z.infer<typeof responseSchema>;
const releaseSchema = z.object({
  sha: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number(),
  version: z.string(),
});
async function request(path: string, init?: RequestInit) {
  const response = await fetch('/api/client/device/' + path, {
    ...init,
    headers: {
      ...init?.headers,
      'X-CSRF-Token': sessionStorage.getItem('greenci-csrf') ?? '',
    },
  });
  if (!response.ok) throw new Error(copy.device.unavailable);
  return response.json() as Promise<unknown>;
}
export default function DevicePage() {
  const [state, setState] = useState<DeviceState>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<{
    seq: number;
    expires: number;
  }>();
  const [file, setFile] = useState<File>();
  const [version, setVersion] = useState('');
  const [release, setRelease] = useState<z.infer<typeof releaseSchema>>();
  const refresh = useCallback(async () => {
    try {
      setState(responseSchema.parse(await request('status')));
      setError('');
    } catch {
      setError(copy.device.unavailable);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  const online = Boolean(
    state?.status && Date.now() - state.status.seenAt < 20000,
  );
  const waiting = Boolean(
    (state?.pending && (state.status?.ack ?? 0) < state.pending.seq) ||
    (submitted &&
      submitted.expires * 1000 > Date.now() &&
      (state?.status?.ack ?? 0) < submitted.seq),
  );
  async function send(body: object) {
    setBusy(true);
    setError('');
    try {
      const queued = await request('command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setSubmitted(
        z
          .object({ seq: z.number().int().positive(), expires: z.number() })
          .parse(queued),
      );
      setMessage(copy.device.queued);
      await refresh();
    } catch {
      setError(copy.device.unavailable);
    } finally {
      setBusy(false);
    }
  }
  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (
      !file ||
      file.size < 256 ||
      file.size > 0x1e0000 ||
      !/^greenci-pad-\d+\.\d+\.\d+$/.test(version)
    ) {
      setError(copy.device.noFile);
      return;
    }
    setBusy(true);
    setError('');
    setRelease(undefined);
    setMessage(copy.device.preparing);
    try {
      setRelease(
        releaseSchema.parse(
          await request('release?version=' + encodeURIComponent(version), {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: file,
          }),
        ),
      );
      setMessage(copy.device.prepared);
    } catch {
      setError(copy.device.unavailable);
      setMessage('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={shell.root}>
      <TopBar deckOnline={online} />
      <div className={shell.layout}>
        <SideNav current="deck" prCount={0} />
        <main className={shell.main}>
          <h1 className={shell.h1}>{copy.device.title}</h1>
          <p>{copy.device.note}</p>
          {error && <Banner tone="fail" title={error} />}
          <p role="status">
            {!state?.status
              ? copy.device.empty
              : online
                ? copy.device.online
                : copy.device.offline}
          </p>
          <div className={styles.buttons}>
            <Button variant="secondary" onClick={() => void refresh()}>
              {copy.device.refresh}
            </Button>
          </div>
          {state?.status && (
            <dl className={styles.facts}>
              <div>
                <dt>{copy.device.firmware}</dt>
                <dd>{state.status.firmware}</dd>
              </div>
              <div>
                <dt>{copy.device.slot}</dt>
                <dd>{state.status.slot}</dd>
              </div>
              <div>
                <dt>{copy.device.result}</dt>
                <dd>{state.status.result}</dd>
              </div>
              <div>
                <dt>
                  {state.status.healthy
                    ? copy.device.healthy
                    : copy.device.pending}
                </dt>
                <dd>{new Date(state.status.seenAt).toLocaleTimeString()}</dd>
              </div>
            </dl>
          )}
          {state?.status?.battery && (
            <section aria-label={copy.device.batteryVoltage}>
              <dl className={styles.facts}>
                <div>
                  <dt>{copy.device.batteryVoltage}</dt>
                  <dd>
                    {(state.status.battery.millivolts / 1000).toFixed(2)}{' '}
                    {copy.device.volts}
                  </dd>
                </div>
                <div>
                  <dt>{copy.device.batteryCharge}</dt>
                  <dd>
                    {state.status.battery.percent === null ? (
                      copy.device.batteryUnavailable
                    ) : (
                      <>
                        {copy.device.batteryEstimate}{' '}
                        {state.status.battery.percent}
                        {copy.device.percent}
                      </>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{copy.device.batteryCapacity}</dt>
                  <dd>
                    {state.status.battery.nominalMah} {copy.device.mah}
                  </dd>
                </div>
              </dl>
              <p>{copy.device.batteryNote}</p>
            </section>
          )}
          <div className={styles.controls}>
            {(['led1', 'led4'] as const).map((op) => (
              <fieldset key={op} disabled={!online || busy || waiting}>
                <legend>{copy.device[op]}</legend>
                <div className={styles.buttons}>
                  {[0, 1, 5, 20].map((value, i) => (
                    <Button
                      key={value}
                      variant={
                        state?.status?.[op] === value ? 'primary' : 'secondary'
                      }
                      onClick={() => void send({ op, value })}
                    >
                      {copy.device.brightness[i]}
                    </Button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className={styles.buttons}>
            <Button
              variant="secondary"
              disabled={!online || busy || waiting}
              onClick={() => void send({ op: 'home' })}
            >
              {copy.device.home}
            </Button>
            <Button
              variant="secondary"
              disabled={!online || busy || waiting}
              onClick={() => void send({ op: 'reboot' })}
            >
              {copy.device.restart}
            </Button>
          </div>
          <p aria-live="polite">
            {waiting
              ? copy.device.queued
              : message === copy.device.queued
                ? submitted &&
                  (state?.status?.ack ?? 0) >= submitted.seq &&
                  (state?.status?.result === 'applied' ||
                    state?.status?.result === 'boot')
                  ? copy.device.applied
                  : copy.device.rejected
                : message}
          </p>
          <section className={styles.update}>
            <h2>{copy.device.updateTitle}</h2>
            <p>{copy.device.updateNote}</p>
            <form
              onSubmit={(event) => void upload(event)}
              className={styles.form}
            >
              <label>
                {copy.device.file}
                <input
                  type="file"
                  accept=".bin"
                  disabled={busy}
                  onChange={(event) => {
                    setFile(event.target.files?.[0]);
                    setRelease(undefined);
                  }}
                />
              </label>
              <label>
                {copy.device.version}
                <input
                  value={version}
                  onChange={(event) => {
                    setVersion(event.target.value);
                    setRelease(undefined);
                  }}
                  required
                  pattern="greenci-pad-[0-9]+\.[0-9]+\.[0-9]+"
                  aria-describedby="version-hint"
                />
              </label>
              <span id="version-hint">{copy.device.versionHint}</span>
              <Button
                type="submit"
                variant="secondary"
                disabled={busy || !file}
              >
                {copy.device.upload}
              </Button>
            </form>
            {release && (
              <div className={styles.release}>
                <code>
                  {release.version} · {release.size} {copy.device.bytes}
                </code>
                <Button
                  disabled={!online || busy || waiting}
                  onClick={() => void send({ op: 'ota', sha: release.sha })}
                >
                  {copy.device.install}
                </Button>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
