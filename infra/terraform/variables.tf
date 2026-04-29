variable "project_id" {
  description = "GCP project id (e.g. fresh-platform-prod)"
  type        = string
}

variable "region" {
  description = "GCP region. africa-south1 only — latency to Nairobi is the deciding factor."
  type        = string
  default     = "africa-south1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod). Used as a tag and in resource names."
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "commerce_api_image" {
  description = "Container image for commerce-api. Set by CI to the latest digest."
  type        = string
  default     = "gcr.io/cloudrun/hello" # placeholder until first deploy
}

variable "db_tier" {
  description = "Cloud SQL tier."
  type        = string
  default     = "db-f1-micro" # 0.6 GB RAM. Bump to db-custom-2-7680 for prod.
}

variable "redis_memory_gb" {
  description = "Memorystore Redis size in GB."
  type        = number
  default     = 1
}

variable "min_instances" {
  description = "Cloud Run min instances. Keep at 0 for dev (cold starts are fine)."
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Cloud Run max instances."
  type        = number
  default     = 5
}
