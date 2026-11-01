# Watchdog PR Review

Security review on every pull request by the [Watchdog](https://github.com/watchdoglab/watchdog) dogs. It leaves inline comments on risky lines with a fix, then one summary comment.

## Setup (2 minutes)

1. Add your Anthropic API key as a repo secret named `ANTHROPIC_API_KEY`
   (Settings → Secrets and variables → Actions).
2. Add this file as `.github/workflows/watchdog-review.yml`:

```yaml
name: Watchdog PR Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]

permissions:
  contents: read
  pull-requests: write
  id-token: write

jobs:
  review:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1
      - uses: watchdoglab/watchdog-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          dogs: all          # or web, api, auth, ai-app, secrets, ...
          min_severity: medium
```

3. Open a PR. Watchdog comments on risky lines and posts a summary.

## Inputs

| Input | Default | What it does |
|---|---|---|
| `anthropic_api_key` | — | Required. Your API key secret. |
| `dogs` | `all` | Which review: `all`, `web`, `api`, `auth`, `ai-app`, `secrets`, … |
| `min_severity` | `medium` | Skip findings below this. |
| `model` | `claude-sonnet-5-5` | Claude model. |

## Safety

- Uses `pull_request` (not `pull_request_target`), so PRs from forks never see your secrets.
- The reviewer can only read code and post comments. It cannot push, run project code or reach the network.
- PR text is treated as untrusted input, never as instructions.
