# M5 product screens: fidelity

Built against `design/screens/WebDashboard.png`, `WebRun.png`, `Onboarding.png` and `States.png`, using only `design-system/tokens.css` and `components.css`.

| Screen                          | Evidence                                         |
| ------------------------------- | ------------------------------------------------ |
| Dashboard (desktop)             | `m5-app.png`                                     |
| Dashboard (390px phone)         | `m5-app-mobile.png`                              |
| Run detail, failing             | `m5-run.png`                                     |
| Run detail, fix PR opened       | `m5-run-done.png`                                |
| Onboarding steps 1, 3, 4        | `m5-start.png`, `m5-start3.png`, `m5-start4.png` |
| States catalogue `/app/_states` | `m5-states.png`                                  |

Deliberate differences from the boards:

- The dashboard stats count real runs (fixed, in progress, needs you, failing) instead of the board's weekly sample numbers, because no weekly history exists yet.
- Deck status reads "No deck connected": the API does not report hardware presence yet, so the UI does not claim it.
- Onboarding is a wizard (one step at a time with progress pills) rather than four cards side by side; the board showed the storyboard.
- Step 3 lists only the practice repo until the GitHub App is installed (M7).
