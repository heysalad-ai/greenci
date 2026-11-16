# GreenCI source-repair practice

This repository has an intentional bug and failing tests. It is a learning fixture, not application code for production.

Create your own repository from the [GreenCI starter template](https://github.com/heysalad-ai/greenci-starter/generate), then enable GitHub Actions and wait for **Practice test** to fail on the default commit. Sign in to the GreenCI beta, install its GitHub App only on your practice repository, refresh repositories and connect it. Open the repair dashboard and choose **Start repair**.

GreenCI should diagnose the source bug, prepare a small change, run the original tests and open a draft pull request for you to review. It does not merge the pull request. Keep the tests and workflow unchanged during the repair.

The supported command is `node --test test.mjs` on Node 22. There are no dependencies or package installs. Both tests fail before the source is repaired.

Only connect a repository whose source and logs you are comfortable sending to OpenAI during a requested repair. Do not add credentials, personal information or production data to this practice repository.
