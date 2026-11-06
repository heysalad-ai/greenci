export const copy = {
  name: 'GreenCI',
  scaffold: 'M0.5 scaffold. Product screens and agent jobs follow in M1–M9.',
  health: 'Service health',
  deck: 'Deck simulator',
  deckNote:
    'Local transport check. Press a key or use 1–4. Agent jobs are not connected yet.',
  connected: 'Deck connected. Press Diagnose.',
  disconnected: 'Deck offline. Reload to reconnect.',
  connecting: 'Connecting to the deck…',
  command: 'Command',
  diagnose: 'Diagnose',
  repair: 'Repair',
  verify: 'Verify',
  acknowledged: 'Key received',
  emails: 'Local emails',
  noEmails: 'No emails yet. The first fix email follows in M8.',
  unavailable: 'The API did not answer. Check pnpm dev and reload.',
} as const;
