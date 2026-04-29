// Secrets that aren't auto-generated. Terraform creates the placeholder; you populate
// the value via:  gcloud secrets versions add NAME --data-file=- <<< "your-value"

locals {
  user_managed_secrets = [
    "ERPNEXT_URL",
    "ERPNEXT_API_KEY",
    "ERPNEXT_API_SECRET",
    "JWT_SECRET",
    "MPESA_CONSUMER_KEY",
    "MPESA_CONSUMER_SECRET",
    "MPESA_SHORTCODE",
    "MPESA_PASSKEY",
    "MPESA_CALLBACK_URL",
    "BRAND_NAME",
    "SUPPORT_EMAIL",
  ]
}

resource "google_secret_manager_secret" "user_managed" {
  for_each   = toset(local.user_managed_secrets)
  secret_id  = each.value
  depends_on = [google_project_service.apis]
  replication { auto {} }
}

// Service account for commerce-api Cloud Run service.
resource "google_service_account" "commerce_api" {
  account_id   = "commerce-api"
  display_name = "commerce-api Cloud Run service account"
}

// Grant the service account access to read all secrets we declare.
resource "google_secret_manager_secret_iam_member" "commerce_api_secrets" {
  for_each = merge(
    { for s in local.user_managed_secrets : s => google_secret_manager_secret.user_managed[s].id },
    {
      DATABASE_URL = google_secret_manager_secret.database_url.id
      REDIS_URL    = google_secret_manager_secret.redis_url.id
    },
  )
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.commerce_api.email}"
}

// Grant Pub/Sub publisher to commerce-api.
resource "google_project_iam_member" "commerce_api_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.commerce_api.email}"
}

// Grant Cloud SQL client.
resource "google_project_iam_member" "commerce_api_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.commerce_api.email}"
}
