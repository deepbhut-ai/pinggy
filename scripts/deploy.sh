#!/usr/bin/env bash
set -Eeuo pipefail

# Deploy the current committed branch to the production server.
# Override any default with environment variables, for example:
#   DEPLOY_HOST=example.com DEPLOY_BRANCH=staging ./scripts/deploy.sh

DEPLOY_HOST="${DEPLOY_HOST:-13.140.131.204}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/pinggy}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_REMOTE="${DEPLOY_REMOTE:-origin}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8000/health}"
SSH_IDENTITY="${SSH_IDENTITY:-}"

log() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

command -v git >/dev/null || fail "git is required"
command -v ssh >/dev/null || fail "ssh is required"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "run this inside the Git repository"
cd "$repo_root"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$DEPLOY_BRANCH" ]] || fail "current branch is '$current_branch'; expected '$DEPLOY_BRANCH'"

if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  fail "working tree is not clean; commit your code and keep secrets out of Git before deploying"
fi

ssh_args=(-o ConnectTimeout=15 -o ServerAliveInterval=30)
if [[ -n "$SSH_IDENTITY" ]]; then
  ssh_args+=(-i "$SSH_IDENTITY" -o IdentitiesOnly=yes)
fi

log "Pushing $DEPLOY_BRANCH to $DEPLOY_REMOTE"
git push "$DEPLOY_REMOTE" "$DEPLOY_BRANCH"

log "Deploying on $DEPLOY_USER@$DEPLOY_HOST"
ssh "${ssh_args[@]}" "$DEPLOY_USER@$DEPLOY_HOST" bash -s -- \
  "$DEPLOY_PATH" "$DEPLOY_REMOTE" "$DEPLOY_BRANCH" "$HEALTH_URL" <<'REMOTE'
set -Eeuo pipefail

deploy_path="$1"
remote_name="$2"
branch="$3"
health_url="$4"

cd "$deploy_path"

if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  echo "ERROR: server working tree is not clean" >&2
  exit 1
fi

git fetch "$remote_name" "$branch"
git checkout "$branch"
git merge --ff-only "$remote_name/$branch"

if [[ -x .venv/bin/pip ]]; then
  .venv/bin/pip install -r requirements.txt
fi

# Non-interactive SSH shells do not load nvm automatically.
if ! command -v npm >/dev/null && [[ -s /root/.nvm/nvm.sh ]]; then
  export NVM_DIR=/root/.nvm
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
fi
command -v npm >/dev/null || {
  echo "ERROR: npm is not installed or available in PATH" >&2
  exit 1
}

npm ci
npm run build

systemctl restart pinggy
nginx -t
systemctl reload nginx

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent --show-error "$health_url"; then
    printf '\n'
    systemctl is-active --quiet pinggy
    systemctl is-active --quiet nginx
    echo "Deployment successful: $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 2
done

echo "ERROR: health check failed after 10 attempts" >&2
journalctl -u pinggy -n 40 --no-pager >&2
exit 1
REMOTE
