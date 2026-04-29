output "commerce_api_url" {
  description = "Public URL of the commerce-api Cloud Run service."
  value       = google_cloud_run_v2_service.commerce_api.uri
}

output "artifact_registry_repo" {
  description = "Container repo where commerce-api images are pushed."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.commerce_api.repository_id}"
}

output "postgres_connection_name" {
  description = "Cloud SQL connection name (for Cloud SQL Auth Proxy)."
  value       = google_sql_database_instance.postgres.connection_name
  sensitive   = true
}

output "redis_host" {
  description = "Memorystore Redis host (private IP)."
  value       = google_redis_instance.redis.host
  sensitive   = true
}

output "service_account_email" {
  description = "commerce-api service account email."
  value       = google_service_account.commerce_api.email
}
