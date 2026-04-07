variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (production | staging)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "environment must be 'production' or 'staging'."
  }
}

variable "project" {
  description = "Short project name used as a prefix for all resource names"
  type        = string
  default     = "nakama-ttt"
}

variable "domain_name" {
  description = "Root domain name. The API will be served from api.<domain_name>. A Route53 hosted zone for this domain must already exist."
  type        = string
  # Example: "tictactoe.example.com"
}

variable "nakama_server_key" {
  description = "Nakama server key (used by clients to authenticate). Stored in Secrets Manager."
  type        = string
  sensitive   = true
  default     = "defaultkey"
}

variable "db_password" {
  description = "Aurora PostgreSQL master password for the 'nakama' user. Stored in Secrets Manager."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.db_password) >= 16
    error_message = "db_password must be at least 16 characters long."
  }
}

variable "console_password" {
  description = "Nakama developer console password. Stored in Secrets Manager."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.console_password) >= 12
    error_message = "console_password must be at least 12 characters long."
  }
}

variable "ecs_desired_count" {
  description = "Number of Nakama ECS tasks to run"
  type        = number
  default     = 1

  validation {
    condition     = var.ecs_desired_count >= 1 && var.ecs_desired_count <= 10
    error_message = "ecs_desired_count must be between 1 and 10."
  }
}
