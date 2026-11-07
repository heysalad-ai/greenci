import {
  Button,
  ActionKey,
  StatusChip,
  Toast,
  Banner,
  RunCard,
  CommandField,
  Terminal,
  Logo,
  Mascot,
} from '@greenci/ui';
import { copy } from '@greenci/core';
import styles from './ui.module.css';
export default function UIPage() {
  const samples = {
    Button: (
      <div className="gc-row">
        <Button>{copy.openPr}</Button>
        <Button variant="secondary">{copy.health}</Button>
        <Button disabled>{copy.verify}</Button>
      </div>
    ),
    ActionKey: (
      <div className="gc-deck">
        {(['command', 'diagnose', 'repair', 'verify'] as const).map((name) => (
          <ActionKey key={name} name={name} />
        ))}
      </div>
    ),
    StatusChip: (
      <div className="gc-row">
        <StatusChip tone="pass">{copy.passing}</StatusChip>
        <StatusChip tone="fail">{copy.failing}</StatusChip>
        <StatusChip tone="work">{copy.diagnosing}</StatusChip>
        <StatusChip tone="wait">{copy.needsYou}</StatusChip>
      </div>
    ),
    Toast: (
      <Toast
        title={copy.greenAgain}
        detail={copy.checksPassing}
        mood="passing"
      />
    ),
    Banner: (
      <Banner title={copy.failing} tone="fail">
        {copy.runTitle}
      </Banner>
    ),
    RunCard: (
      <RunCard
        title={copy.runTitle}
        repo="acme/payments"
        sha="a1b2c3d"
        time="09:14"
        mood="failing"
        tone="fail"
        status={copy.failing}
        steps={['done', 'now', '']}
      />
    ),
    CommandField: <CommandField />,
    Terminal: (
      <Terminal>{`✔ ${copy.checksPassing}\nNext: ${copy.nextRepair}`}</Terminal>
    ),
    Logo: <Logo />,
    Mascot: (
      <div className="gc-row">
        {(
          [
            'ready',
            'diagnosing',
            'repairing',
            'verifying',
            'failing',
            'passing',
            'shipped',
          ] as const
        ).map((mood) => (
          <Mascot key={mood} mood={mood} alt={mood} />
        ))}
      </div>
    ),
  };
  return (
    <main className={styles.page}>
      <h1>{copy.uiTitle}</h1>
      {Object.entries(samples).map(([name, sample]) => (
        <section key={name}>
          <h2>{name}</h2>
          <div className={styles.comparison}>
            <div>
              <h3>{copy.implementation}</h3>
              {sample}
            </div>
            <div>
              <h3>{copy.reference}</h3>
              <iframe
                title={`${name} ${copy.reference}`}
                src={`/references/${name}.html`}
              />
            </div>
          </div>
        </section>
      ))}
    </main>
  );
}
