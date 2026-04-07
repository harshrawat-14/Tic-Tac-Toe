output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "api_url" {
  description = "Public HTTPS URL for the Nakama API (via Route53)"
  value       = "https://api.${var.domain_name}"
}

output "ecr_repository_url" {
  description = "ECR repository URL for pushing Nakama Docker images"
  value       = aws_ecr_repository.nakama.repository_url
}

output "rds_endpoint" {
  description = "Aurora PostgreSQL cluster writer endpoint"
  value       = aws_rds_cluster.nakama.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis cluster endpoint"
  value       = aws_elasticache_cluster.nakama.cache_nodes[0].address
  sensitive   = true
}

output "ecs_cluster_name" {
  description = "ECS cluster name (used in deploy scripts)"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name (used in deploy scripts)"
  value       = aws_ecs_service.nakama.name
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group name for Nakama container logs"
  value       = aws_cloudwatch_log_group.nakama.name
}

output "secrets_manager_arn" {
  description = "ARN of the Nakama secrets in Secrets Manager"
  value       = aws_secretsmanager_secret.nakama.arn
}
