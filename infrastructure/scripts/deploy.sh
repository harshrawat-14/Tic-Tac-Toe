#!/usr/bin/env bash
# infrastructure/scripts/deploy.sh
# Builds the Nakama backend, pushes to ECR, and updates the ECS service.
# Usage: ./deploy.sh [git-sha]
# Environment variables required:
#   AWS_REGION, ECR_REGISTRY, ECS_CLUSTER, ECS_SERVICE
#   (or configure via AWS CLI default profile / IAM role)

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/backend"

AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REGISTRY="${ECR_REGISTRY:?ECR_REGISTRY env var is required}"
ECR_REPO="${ECR_REGISTRY}/nakama-tictactoe"
ECS_CLUSTER="${ECS_CLUSTER:?ECS_CLUSTER env var is required}"
ECS_SERVICE="${ECS_SERVICE:?ECS_SERVICE env var is required}"

# Determine image tag — prefer $1 arg, else git SHA, else 'latest'
GIT_SHA="${1:-$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo 'latest')}"
IMAGE_TAG="${GIT_SHA}"

echo "═══════════════════════════════════════════════════════════"
echo " Nakama TicTacToe — Deploy"
echo " Region:   ${AWS_REGION}"
echo " ECR:      ${ECR_REPO}"
echo " Cluster:  ${ECS_CLUSTER}"
echo " Service:  ${ECS_SERVICE}"
echo " Tag:      ${IMAGE_TAG}"
echo "═══════════════════════════════════════════════════════════"

# ─── Step 1: Build backend TypeScript ─────────────────────────────────────────

echo ""
echo "▶ Step 1/6 — Building backend TypeScript..."
cd "${BACKEND_DIR}"
npm ci --prefer-offline
npm run build
echo "  ✓ Backend built: build/index.js"

# ─── Step 2: Docker build ─────────────────────────────────────────────────────

echo ""
echo "▶ Step 2/6 — Building Docker image..."
cd "${BACKEND_DIR}"
docker build \
  --platform linux/amd64 \
  --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --build-arg GIT_SHA="${GIT_SHA}" \
  -t "${ECR_REPO}:${IMAGE_TAG}" \
  -t "${ECR_REPO}:latest" \
  -f Dockerfile \
  .
echo "  ✓ Image built: ${ECR_REPO}:${IMAGE_TAG}"

# ─── Step 3: ECR login ────────────────────────────────────────────────────────

echo ""
echo "▶ Step 3/6 — Logging in to ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"
echo "  ✓ ECR authenticated"

# ─── Step 4: Push image ───────────────────────────────────────────────────────

echo ""
echo "▶ Step 4/6 — Pushing image to ECR..."
docker push "${ECR_REPO}:${IMAGE_TAG}"
docker push "${ECR_REPO}:latest"
echo "  ✓ Pushed: ${ECR_REPO}:${IMAGE_TAG}"
echo "  ✓ Pushed: ${ECR_REPO}:latest"

# ─── Step 5: Update ECS service ───────────────────────────────────────────────

echo ""
echo "▶ Step 5/6 — Triggering ECS rolling deploy..."
aws ecs update-service \
  --region "${AWS_REGION}" \
  --cluster "${ECS_CLUSTER}" \
  --service "${ECS_SERVICE}" \
  --force-new-deployment \
  --output json \
  | jq -r '.service.deployments[] | "  deployment: \(.status) (\(.runningCount)/\(.desiredCount) tasks)"'

# ─── Step 6: Wait for stability ───────────────────────────────────────────────

echo ""
echo "▶ Step 6/6 — Waiting for service to stabilize (timeout: 10 min)..."
aws ecs wait services-stable \
  --region "${AWS_REGION}" \
  --cluster "${ECS_CLUSTER}" \
  --services "${ECS_SERVICE}"

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅  Deploy complete!"
echo "  Image: ${ECR_REPO}:${IMAGE_TAG}"
echo "  Service: https://console.aws.amazon.com/ecs/v2/clusters/${ECS_CLUSTER}/services/${ECS_SERVICE}"
echo "═══════════════════════════════════════════════════════════"
