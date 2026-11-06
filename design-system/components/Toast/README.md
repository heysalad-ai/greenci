# Toast

A short message that floats in, bottom-right on desktop and top on mobile, with the key's face showing the mood.

- Markup: `gc-toast` with a 36px key face, a bold one-line title, an optional 1–2 line detail and at most one button.
- Title says what happened in plain words: “Green again”, “test (ubuntu) failed on main”, “Fix PR opened”.
- Success toasts dismiss after 5s. Failures and anything with a button stay until acted on or closed.
- Never stack more than three; collapse the rest into “+4 more”.
