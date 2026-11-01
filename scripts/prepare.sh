#!/usr/bin/env bash
# Builds .watchdog/ in the workspace: PR diff, Watchdog skills and the review prompt.
set -euo pipefail
dir="$GITHUB_WORKSPACE/.watchdog"
mkdir -p "$dir"
grep -qxF '.watchdog/' "$GITHUB_WORKSPACE/.git/info/exclude" 2>/dev/null \
  || echo '.watchdog/' >> "$GITHUB_WORKSPACE/.git/info/exclude" || true

gh pr diff "$PR_NUMBER" --repo "$REPO" > "$dir/pr.diff"

if [ "$ENGINE" != "claude" ]; then
  git clone --quiet --depth 1 https://github.com/watchdoglab/watchdog.git "$dir/watchdog"
  case "$DOGS" in *[!a-z0-9-]*) echo "invalid dogs: $DOGS" >&2; exit 1;; esac
  [ -f "$dir/watchdog/plugin/skills/watchdog-go-$DOGS/SKILL.md" ] \
    || { echo "unknown dogs: $DOGS" >&2; exit 1; }
  sed -e "s|__PR__|$PR_NUMBER|g" -e "s|__REPO__|$REPO|g" -e "s|__DOGS__|$DOGS|g" \
      -e "s|__MIN_SEVERITY__|$MIN_SEVERITY|g" "$ACTION_PATH/scripts/review-prompt.md" > "$dir/prompt.md"
  {
    echo 'prompt<<WATCHDOG_EOF'
    cat "$dir/prompt.md"
    echo 'WATCHDOG_EOF'
  } >> "$GITHUB_OUTPUT"
fi

if [ -n "${CODEX_AUTH_JSON:-}" ]; then
  home="$RUNNER_TEMP/codex-home"
  mkdir -p "$home" && chmod 700 "$home"
  printf '%s' "$CODEX_AUTH_JSON" > "$home/auth.json" && chmod 600 "$home/auth.json"
  printf 'cli_auth_credentials_store = "file"\n' > "$home/config.toml"
  echo "codex_home=$home" >> "$GITHUB_OUTPUT"
fi
