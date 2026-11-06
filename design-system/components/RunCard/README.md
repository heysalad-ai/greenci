# RunCard

One row per CI run GreenCI is watching: the key face, what failed and where, the status chip and a three-step progress bar for Diagnose, Repair and Verify.

- Markup: `gc-run` → face (40px key), title block (`h4` + `.meta` with repo, SHA in `code`, time), `gc-chip`, then `gc-steps` with three `gc-step` (`done`, `now`, or empty).
- Title is the failing job and branch, lowercase as GitHub shows it: “build-and-test failed on main”.
- Sort by what needs the person: Needs you, Failing, in progress, then Passing.
