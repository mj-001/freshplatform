resource "google_redis_instance" "redis" {
  name               = "fresh-platform-${var.environment}-redis"
  tier               = var.environment == "prod" ? "STANDARD_HA" : "BASIC"
  memory_size_gb     = var.redis_memory_gb
  region             = var.region
  authorized_network = google_compute_network.vpc.id
  redis_version      = "REDIS_7_0"
  display_name       = "fresh-platform-${var.environment}"
  depends_on         = [google_project_service.apis]
}

resource "google_secret_manager_secret" "redis_url" {
  secret_id  = "REDIS_URL"
  depends_on = [google_project_service.apis]
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "redis_url" {
  secret      = google_secret_manager_secret.redis_url.id
  secret_data = format("redis://%s:%d", google_redis_instance.redis.host, google_redis_instance.redis.port)
}
