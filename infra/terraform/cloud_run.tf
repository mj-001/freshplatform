resource "google_artifact_registry_repository" "commerce_api" {
  location      = var.region
  repository_id = "commerce-api"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

resource "google_cloud_run_v2_service" "commerce_api" {
  name     = "commerce-api-${var.environment}"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.commerce_api.email
    timeout         = "30s"

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.commerce_api_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      ports {
        container_port = 8080
      }

      env {
        name  = "NODE_ENV"
        value = var.environment == "prod" ? "production" : "development"
      }
      env {
        name  = "PORT"
        value = "8080"
      }
      env {
        name  = "PUBSUB_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "JWT_ISSUER"
        value = "fresh-platform"
      }
      env {
        name  = "JWT_AUDIENCE"
        value = "fresh-platform-storefront"
      }
      env {
        name  = "MPESA_ENV"
        value = var.environment == "prod" ? "production" : "sandbox"
      }

      // Secrets — see secrets.tf
      dynamic "env" {
        for_each = toset([
          "DATABASE_URL", "REDIS_URL", "ERPNEXT_URL", "ERPNEXT_API_KEY",
          "ERPNEXT_API_SECRET", "JWT_SECRET", "MPESA_CONSUMER_KEY",
          "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY",
          "MPESA_CALLBACK_URL", "BRAND_NAME", "SUPPORT_EMAIL",
        ])
        content {
          name = env.value
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/health"
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        timeout_seconds       = 3
        failure_threshold     = 6
      }

      liveness_probe {
        http_get {
          path = "/health"
        }
        period_seconds  = 30
        timeout_seconds = 5
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_iam_member.commerce_api_secrets,
  ]
}

// Allow public access to Cloud Run.
// In prod consider fronting with Cloud Armor or restricting to known IPs.
resource "google_cloud_run_v2_service_iam_member" "commerce_api_public" {
  location = google_cloud_run_v2_service.commerce_api.location
  name     = google_cloud_run_v2_service.commerce_api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
