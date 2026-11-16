import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import { copy } from '@greenci/core';
/** Official Primer Octicons mark; brand silhouettes retain their original fill. */
export function GitHubIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
    </svg>
  );
}
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
  name: Key | 'mail' | 'check' | 'cross' | 'clock' | 'spinner';
}) {
  const paths = {
    mail: 'M3 5h18v14H3V5Zm0 0 9 7 9-7',
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
  hot = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  name: Key;
  busy?: boolean;
  pressed?: boolean;
  /** The key the current run is waiting for (breathes orange on hardware). */
  hot?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      aria-busy={busy}
      className={`gc-key ${name === 'command' ? 'gc-key--command' : ''} ${busy ? 'is-busy' : ''} ${pressed ? 'is-pressed' : ''} ${hot ? 'is-hot' : ''}`}
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
