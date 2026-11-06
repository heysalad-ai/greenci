# Mascot

The key has seven moods, one per moment in a run. Use them for status, not decoration.

| Mood | When | Copy that goes with it |
| --- | --- | --- |
| ready | Deck connected, nothing failing | “All green. Nothing to fix.” |
| diagnosing | Reading logs after Diagnose | “Reading the logs…” |
| repairing | Writing the fix after Repair | “Writing a fix on `greenci/fix-4182`” |
| verifying | Re-running checks after Verify | “Re-running 12 checks” |
| failing | A check is red and GreenCI is not working on it | “`test (ubuntu)` failed on main” |
| passing | Checks went green after a fix | “Green again. 12/12 checks passing.” |
| shipped | Fix PR merged | “Merged. That one's done.” |

- Files: the **Moods** asset group (`key-<mood>.svg`). Show one face at a time, at 24px or larger.
- The failing face is the only grey key: the key literally turns green when the build does.
- Never animate the face into a talking character, add arms or legs, or use it on error messages about the person's own mistakes (billing, auth). It reacts to builds, not to people.
