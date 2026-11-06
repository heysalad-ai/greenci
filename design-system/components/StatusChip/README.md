# StatusChip

A compact label for the state of a check, run or PR. Colour never carries the meaning alone: every chip has an icon and a word.

- Markup: `<span class="gc-chip gc-chip--pass"><svg…/>Passing</span>`. Tones: `--pass` (brand-tint), `--fail` (fail-tint), `--work` (work-tint, with the spinning arc), `--wait` (wait-tint), `--idle` (surface-sunken).
- Words are fixed: Passing, Failing, Diagnosing, Repairing, Verifying, Needs you, Queued, Merged, Skipped.
- The spinner stops under `prefers-reduced-motion`.
