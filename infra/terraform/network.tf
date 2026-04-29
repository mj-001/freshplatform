// VPC for private connectivity from Cloud Run to Cloud SQL and Memorystore.

resource "google_compute_network" "vpc" {
  name                    = "fresh-platform-${var.environment}-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "subnet" {
  name          = "fresh-platform-${var.environment}-subnet"
  ip_cidr_range = "10.10.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
  private_ip_google_access = true
}

// Reserve a private range for service-to-service connections (Cloud SQL, Memorystore).
resource "google_compute_global_address" "private_range" {
  name          = "fresh-platform-${var.environment}-private-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_range.name]
  depends_on              = [google_project_service.apis]
}

// Connector so Cloud Run can reach the VPC.
resource "google_vpc_access_connector" "connector" {
  name           = "fp-${var.environment}-connector"
  region         = var.region
  network        = google_compute_network.vpc.name
  ip_cidr_range  = "10.20.0.0/28"
  min_throughput = 200
  max_throughput = 300
  depends_on     = [google_project_service.apis]
}
