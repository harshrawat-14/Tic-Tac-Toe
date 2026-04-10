# Deployment Guide — Nakama TicTacToe

## Quick Deploy (Render backend + Vercel frontend)

### 1) Deploy backend on Render

1. Push this repo to GitHub.
2. In Render, create a **Blueprint** service from the repo.
3. Render will use [render.yaml](../render.yaml) to create:
  - PostgreSQL database: `ttt-postgres`
  - Docker web service: `ttt-nakama` (from [backend/Dockerfile.render](../backend/Dockerfile.render))
4. After deploy, copy backend public URL (example: `https://ttt-nakama.onrender.com`).

Required backend secrets are auto-generated in the blueprint:
- `NAKAMA_SERVER_KEY`
- `NAKAMA_SESSION_ENCRYPTION_KEY`
- `NAKAMA_SESSION_REFRESH_ENCRYPTION_KEY`
- `NAKAMA_RUNTIME_HTTP_KEY`

> Save `NAKAMA_SERVER_KEY` value. Frontend must use the same key.

### 2) Deploy frontend on Vercel

1. Import repo in Vercel.
2. Set project root to `frontend`.
3. Vercel picks [frontend/vercel.json](../frontend/vercel.json) automatically.
4. Add environment variables:
  - `VITE_NAKAMA_URL=https://<your-render-backend>.onrender.com`
  - `VITE_NAKAMA_SERVER_KEY=<same NAKAMA_SERVER_KEY from Render>`
5. Deploy.

### 3) Post-deploy validation

1. Register/login from the Vercel URL.
2. Open two browser sessions and start matchmaking.
3. Validate all end states:
  - win verdict
  - draw verdict
  - forfeit verdict
4. Confirm backend logs in Render show `GAME_OVER` events.

### 4) Production notes

- Render free instances may spin down when idle; first request can be slow.
- Keep frontend and backend in the same region when possible.
- If you rotate `NAKAMA_SERVER_KEY` in Render, also update Vercel env and redeploy frontend.

### 5) Environment variable source map (manual setup)

If you deploy via **manual Web Service** instead of Blueprint, use this table.

| Variable | Set In | Where to get it |
|---|---|---|
| `DB_HOST` | Render backend service env | Render PostgreSQL → **Connections** → Host |
| `DB_PORT` | Render backend service env | Render PostgreSQL → **Connections** → Port (usually `5432`) |
| `DB_USER` | Render backend service env | Render PostgreSQL → **Connections** → Username |
| `DB_PASSWORD` | Render backend service env | Render PostgreSQL → **Connections** → Password |
| `DB_NAME` | Render backend service env | Render PostgreSQL → **Connections** → Database name |
| `NAKAMA_SERVER_KEY` | Render backend service env | Generate random string in Render (Generate button) |
| `NAKAMA_SESSION_ENCRYPTION_KEY` | Render backend service env | Generate random string in Render (Generate button) |
| `NAKAMA_SESSION_REFRESH_ENCRYPTION_KEY` | Render backend service env | Generate random string in Render (Generate button) |
| `NAKAMA_RUNTIME_HTTP_KEY` | Render backend service env | Generate random string in Render (Generate button) |
| `VITE_NAKAMA_URL` | Vercel project env | Public URL of Render backend service (e.g. `https://ttt-nakama.onrender.com`) |
| `VITE_NAKAMA_SERVER_KEY` | Vercel project env | Must be exactly the same value as `NAKAMA_SERVER_KEY` |

Reference file for backend env names: [backend/.env.render.example](../backend/.env.render.example)
Reference file for frontend env names: [frontend/.env.production.example](../frontend/.env.production.example)

## Cost Estimate (us-east-1, monthly)

| Service | Config | ~Cost/mo |
|---|---|---|
| ECS Fargate | 1 vCPU / 2 GB, 730 hrs | ~$30 |
| Aurora Serverless v2 | 0.5–8 ACU, light load | ~$20–60 |
| ALB | ~30 GB processed | ~$20 |
| ElastiCache | cache.t3.micro | ~$15 |
| NAT Gateway | ~10 GB | ~$10 |
| ECR | ~1 GB storage | ~$0.10 |
| Route53 | 1 hosted zone | ~$0.50 |
| **Total** | | **~$95–135/mo** |

> Aurora scales to 0 ACU when idle (staging), so staging is ~$30/mo.

---

## Prerequisites

- [ ] AWS CLI v2: `aws --version`
- [ ] Terraform >= 1.6: `terraform --version`
- [ ] Docker w/ BuildKit: `docker buildx version`
- [ ] `jq`: `jq --version`
- [ ] AWS IAM user/role with: `ECS`, `ECR`, `RDS`, `ElastiCache`, `S3`, `IAM`, `SecretsManager`, `Route53`, `ACM`, `CloudWatch`
- [ ] A **Route53 hosted zone** for your domain already exists
- [ ] An **S3 bucket** for Terraform state

---

## 1. Initial Setup

### 1a. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 1b. Configure Terraform state backend

Edit `infrastructure/terraform/main.tf` backend block:

```hcl
backend "s3" {
  bucket  = "your-terraform-state-bucket"
  key     = "nakama-tictactoe/terraform.tfstate"
  region  = "us-east-1"
  encrypt = true
}
```

### 1c. Create terraform.tfvars

```bash
cat > infrastructure/terraform/terraform.tfvars <<EOF
aws_region        = "us-east-1"
environment       = "production"
domain_name       = "yourdomain.com"
nakama_server_key = "your-secret-server-key"
db_password       = "your-secure-db-password-16-chars"
console_password  = "your-console-password"
ecs_desired_count = 1
EOF
```

> ⚠️ Never commit `terraform.tfvars` to git. It's in `.gitignore`.

### 1d. Initialize and apply

```bash
cd infrastructure/terraform

# Initialize with S3 backend
terraform init \
  -backend-config="bucket=your-terraform-state-bucket" \
  -backend-config="region=us-east-1"

# Review the plan (creates ~35 resources)
terraform plan -out=tfplan

# Apply (takes ~15 minutes for Aurora + ACM DNS validation)
terraform apply tfplan
```

### 1e. Note outputs

```bash
terraform output -json
# Copy: ecr_repository_url, ecs_cluster_name, ecs_service_name
```

---

## 2. First Deploy

### 2a. Set environment variables

```bash
export AWS_REGION="us-east-1"
export ECR_REGISTRY="$(terraform output -raw ecr_repository_url | cut -d/ -f1)"
export ECS_CLUSTER="$(terraform output -raw ecs_cluster_name)"
export ECS_SERVICE="$(terraform output -raw ecs_service_name)"
```

### 2b. Run deploy script

```bash
chmod +x infrastructure/scripts/deploy.sh
./infrastructure/scripts/deploy.sh
```

This will:
1. `npm run build` in `/backend`
2. `docker build --platform linux/amd64`
3. ECR login + push (SHA tag + `:latest`)
4. `aws ecs update-service --force-new-deployment`
5. Wait for stability

---

## 3. Updating the Application

```bash
# Make your code changes, then:
./infrastructure/scripts/deploy.sh

# Or with a specific tag:
./infrastructure/scripts/deploy.sh v1.2.3
```

Rolling deploy — ECS replaces old tasks one at a time. Zero downtime for >= 2 tasks.

---

## 4. Monitoring

### CloudWatch Dashboard

```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards
```

### Key metrics to watch

| Metric | Namespace | Warning threshold |
|---|---|---|
| `CPUUtilization` | AWS/ECS | > 80% |
| `MemoryUtilization` | AWS/ECS | > 85% |
| `HealthyHostCount` | AWS/ApplicationELB | < 1 |
| `TargetResponseTime` | AWS/ApplicationELB | > 2s |
| `HTTPCode_ELB_5XX_Count` | AWS/ApplicationELB | > 10 / min |
| `ActiveConnectionCount` | AWS/ApplicationELB | monitor trend |
| `DatabaseConnections` | AWS/RDS | > 80 |

### View live logs

```bash
aws logs tail /ecs/nakama-tictactoe --follow --region us-east-1
```

### ECS Exec (live shell into running container)

```bash
aws ecs execute-command \
  --cluster $ECS_CLUSTER \
  --task $(aws ecs list-tasks --cluster $ECS_CLUSTER --service-name $ECS_SERVICE \
             --query 'taskArns[0]' --output text) \
  --container nakama \
  --interactive \
  --command "/bin/sh"
```

---

## 5. Rollback Procedure

### Option A — Automatic (circuit breaker)
ECS deployment circuit breaker is enabled. If the new task fails health checks 3 times, ECS automatically rolls back to the previous task definition revision.

### Option B — Manual rollback to previous revision

```bash
# List recent task definition revisions
aws ecs list-task-definitions \
  --family-prefix nakama-ttt-task \
  --sort DESC \
  --query 'taskDefinitionArns[:5]'

# Roll back to a specific revision
aws ecs update-service \
  --cluster $ECS_CLUSTER \
  --service $ECS_SERVICE \
  --task-definition nakama-ttt-task:42   # use the revision number before the bad deploy

aws ecs wait services-stable \
  --cluster $ECS_CLUSTER \
  --services $ECS_SERVICE
```

### Option C — Re-deploy previous Docker image

```bash
# Re-tag a previous SHA as latest in ECR
aws ecr describe-images --repository-name nakama-tictactoe \
  --query 'imageDetails[*].{tags:imageTags,pushed:imagePushedAt}' \
  --output table

# Retag and deploy
PREV_SHA=abc1234
ECR_URL=$(terraform output -raw ecr_repository_url)
docker pull ${ECR_URL}:${PREV_SHA}
docker tag ${ECR_URL}:${PREV_SHA} ${ECR_URL}:latest
docker push ${ECR_URL}:latest

# Force deploy
./infrastructure/scripts/deploy.sh ${PREV_SHA}
```

---

## 6. WebSocket + ALB Configuration Notes

> [!IMPORTANT]
> **WebSocket requires two special ALB settings** — both are configured in Terraform:

1. **`idle_timeout = 3600`** (1 hour)  
   The default ALB idle timeout is 60 seconds. This would silently drop WebSocket connections during quiet games. Set to 3600s so connections survive the entire reconnect window (30s) and typical game session.

2. **Stickiness (`lb_cookie`, 86400s)**  
   When ECS runs multiple Nakama tasks, the ALB must route a WebSocket client back to the *same* task for the lifetime of the match. Without stickiness, reconnections may reach a different task with no match state, causing errors.

3. **HTTP → HTTPS redirect**  
   WebSocket connections (`wss://`) must use port 443. Clients connecting to port 80 are redirected to 443.

4. **CORS headers**  
   If your frontend is on a different domain (Vercel), configure Nakama's `NAKAMA_CONSOLE_UI_CONSOLE_URL` and CORS settings in `nakama-config.yml`.

---

## 7. Scaling

```bash
# Scale to 2 tasks (requires stickiness for WebSocket)
aws ecs update-service \
  --cluster $ECS_CLUSTER \
  --service $ECS_SERVICE \
  --desired-count 2
```

Aurora Serverless v2 auto-scales. ElastiCache can be upgraded if Redis IOPS increase.
