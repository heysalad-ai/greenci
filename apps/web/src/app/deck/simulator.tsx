'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { copy } from '@greenci/core';
import { hostMessageSchema, type DeviceMessage } from '@greenci/deck-protocol';
import styles from './simulator.module.css';
const keys = ['command', 'diagnose', 'repair', 'verify'] as const;
const paths = [
  <path key="command" d="M7 9l3 3-3 3M12.5 15H17" />,
  <g key="diagnose">
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5 5" />
  </g>,
  <path
    key="repair"
    d="M14.5 4.5a4.5 4.5 0 0 0-5.8 5.8L4 15l5 5 4.7-4.7a4.5 4.5 0 0 0 5.8-5.8l-2.8 2.8-2.5-.5-.5-2.5z"
  />,
  <g key="verify">
    <path d="M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z" />
    <path d="M8.5 12l2.5 2.5 4.5-5" />
  </g>,
];
export default function Deck() {
  const socket = useRef<WebSocket | null>(null);
  const pressedAt = useRef(0);
  const [status, setStatus] = useState<string>(copy.connecting);
  const [ready, setReady] = useState(false);
  const [lastKey, setLastKey] = useState('');
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8787/deck?serial=GC-1');
    socket.current = ws;
    ws.onopen = () =>
      ws.send(
        JSON.stringify({ type: 'hello', serial: 'GC-1', firmware: 'sim-0.5' }),
      );
    ws.onmessage = (event) => {
      let message: unknown;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const parsed = hostMessageSchema.safeParse(message);
      if (!parsed.success) return;
      if (parsed.data.type === 'face') {
        setReady(true);
        setStatus(copy.connected);
      }
      if (parsed.data.type === 'ack')
        setLastKey(`${copy.acknowledged}: ${copy[parsed.data.key]}`);
    };
    ws.onclose = () => {
      setReady(false);
      setStatus(copy.disconnected);
    };
    ws.onerror = () => {
      setReady(false);
      setStatus(copy.disconnected);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey)
        return;
      const digit = /^Digit[1-4]$/.test(event.code)
        ? Number(event.code.slice(-1))
        : Number(event.key);
      const key = keys[digit - 1];
      if (key && ws.readyState === WebSocket.OPEN)
        ws.send(
          JSON.stringify({
            type: 'key',
            key,
            action:
              event.shiftKey && key === 'command' ? 'long_press' : 'press',
          }),
        );
    };
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('keydown', keydown);
      ws.close();
    };
  }, []);
  function send(message: DeviceMessage) {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify(message));
  }
  return (
    <main className={styles.page}>
      <Image
        src="/brand/logos/greenci-logo.svg"
        alt={copy.name}
        width={168}
        height={40}
        unoptimized
      />
      <h1 className="display-m">{copy.deck}</h1>
      <p>{copy.deckNote}</p>
      <p role="status">{status}</p>
      <div className={`gc-deck ${styles.deck}`}>
        {keys.map((key, index) => (
          <button
            key={key}
            className={`gc-key ${key === 'command' ? 'gc-key--command' : ''}`}
            disabled={!ready}
            aria-label={copy[key]}
            onPointerDown={() => {
              pressedAt.current = Date.now();
            }}
            onClick={(event) =>
              send({
                type: 'key',
                key,
                action:
                  key === 'command' &&
                  event.detail > 0 &&
                  pressedAt.current > 0 &&
                  Date.now() - pressedAt.current >= 800
                    ? 'long_press'
                    : 'press',
              })
            }
          >
            <span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {paths[index]}
              </svg>
              {copy[key]}
            </span>
          </button>
        ))}
      </div>
      <p aria-live="polite" data-testid="last-key">
        {lastKey}
      </p>
    </main>
  );
}
