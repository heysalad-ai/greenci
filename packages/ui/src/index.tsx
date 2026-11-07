import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import { copy } from '@greenci/core';
export type Tone = 'pass' | 'fail' | 'work' | 'wait' | 'idle';
export type Mood =
  | 'ready'
  | 'diagnosing'
  | 'repairing'
  | 'verifying'
  | 'failing'
  | 'passing'
  | 'shipped';
export type Key = 'command' | 'diagnose' | 'repair' | 'verify';
export function Icon({
  name,
}: {
  name: Key | 'check' | 'cross' | 'clock' | 'spinner';
}) {
  const paths = {
    command: 'm5 6 6 6-6 6M13 18h6',
    diagnose: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    repair:
      'm14 6 4-4a7 7 0 0 0-8 8l-7 7a3 3 0 0 0 4 4l7-7a7 7 0 0 0 8-8l-4 4-4-4Z',
    verify: 'M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6l-9-4Zm-5 10 3 3 7-7',
    check: 'm4 12 5 5L20 6',
    cross: 'm6 6 12 12M6 18 18 6',
    clock: 'M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    spinner: 'M22 12A10 10 0 1 1 12 2',
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={name === 'spinner' ? 'gc-spin' : undefined}
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Button({
  variant = 'primary',
  small = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  small?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`gc-btn gc-btn--${variant} ${small ? 'gc-btn--sm' : ''} ${className}`}
    />
  );
}
export function ActionKey({
  name,
  busy = false,
  pressed = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  name: Key;
  busy?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      aria-busy={busy}
      className={`gc-key ${name === 'command' ? 'gc-key--command' : ''} ${busy ? 'is-busy' : ''} ${pressed ? 'is-pressed' : ''}`}
    >
      <span>
        <Icon name={name} />
        {copy[name]}
      </span>
    </button>
  );
}
export function StatusChip({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  const icon = {
    pass: 'check',
    fail: 'cross',
    work: 'spinner',
    wait: 'clock',
    idle: 'clock',
  } as const;
  return (
    <span className={`gc-chip gc-chip--${tone}`}>
      <Icon name={icon[tone]} />
      {children}
    </span>
  );
}
export function Mascot({
  mood,
  size = 40,
  alt = '',
}: {
  mood: Mood;
  size?: number;
  alt?: string;
}) {
  return (
    <img
      src={`/brand/moods/key-${mood}.svg`}
      width={size}
      height={size}
      alt={alt}
    />
  );
}
export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <img
      src={`/brand/logos/greenci-logo${dark ? '-on-dark' : ''}.svg`}
      width={120}
      height={32}
      alt={copy.name}
    />
  );
}
export function Toast({
  title,
  detail,
  mood,
  action,
}: {
  title: string;
  detail?: string;
  mood: Mood;
  action?: ReactNode;
}) {
  return (
    <div className="gc-toast" role="status">
      <Mascot mood={mood} size={36} />
      <div>
        <b>{title}</b>
        {detail && <p>{detail}</p>}
      </div>
      {action}
    </div>
  );
}
export function Banner({
  tone,
  title,
  children,
  action,
}: {
  tone: Exclude<Tone, 'idle'>;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`gc-banner gc-banner--${tone}`} role="status">
      <span>
        <b>{title}</b> {children}
      </span>
      {action}
    </div>
  );
}
export function RunCard({
  title,
  repo,
  sha,
  time,
  mood,
  tone,
  status,
  steps,
}: {
  title: string;
  repo: string;
  sha: string;
  time: string;
  mood: Mood;
  tone: Tone;
  status: string;
  steps: readonly ('done' | 'now' | '')[];
}) {
  return (
    <article className="gc-run">
      <Mascot mood={mood} />
      <div>
        <h4>{title}</h4>
        <div className="meta">
          {repo}
          <code>{sha}</code>
          {time}
        </div>
      </div>
      <StatusChip tone={tone}>{status}</StatusChip>
      <div className="gc-steps" aria-label={copy.phases}>
        {steps.map((state, i) => (
          <div key={i} className={`gc-step ${state}`} />
        ))}
      </div>
    </article>
  );
}
export function CommandField(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="gc-cmd">
      <span className="p" aria-hidden="true">
        ›
      </span>
      <input
        placeholder={copy.commandPlaceholder}
        aria-label={copy.commandPlaceholder}
        {...props}
      />
      <span className="gc-kbd" aria-hidden="true">
        ⌘K
      </span>
    </label>
  );
}
export function Terminal({ children }: { children: ReactNode }) {
  return <pre className="gc-term">{children}</pre>;
}
