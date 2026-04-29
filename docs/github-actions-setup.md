# GitHub Actions secrets

The deploy workflow needs the following secrets and variables configured in your GitHub repo settings (`Settings → Secrets and variables → Actions`).

## Repository variables (public)

| Name | Value | Where to find |
|---|---|---|
| `GCP_PROJECT_ID` | `fresh-platform-dev` (or your project id) | GCP console |

## Repository secrets (private)

| Name | What | How |
|---|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Federation provider resource name | See setup below |
| `GCP_DEPLOYER_SA` | Service account email used for deploys | See setup below |

## Setting up Workload Identity Federation (one time)

GitHub Actions authenticates to GCP without long-lived service account keys. Run once:

```bash
PROJECT_ID="fresh-platform-dev"
REPO="your-org/fresh-platform"   # GitHub org/repo

# Create service account for deploys
gcloud iam service-accounts create gh-deployer \
  --project="$PROJECT_ID" \
  --display-name="GitHub Actions deployer"

SA_EMAIL="gh-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant the roles needed for build + deploy
for role in \
  roles/run.admin \
  roles/iam.serviceAccountUser \
  roles/artifactregistry.writer \
  roles/cloudsql.client \
  roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role"
done

# Create the Workload Identity Pool + Provider
gcloud iam workload-identity-pools create github-pool \
  --project="$PROJECT_ID" \
  --location=global \
  --display-name="GitHub Actions"

POOL_NAME=$(gcloud iam workload-identity-pools describe github-pool \
  --project="$PROJECT_ID" --location=global --format="value(name)")

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub Actions provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '$REPO'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Allow the GitHub repo to impersonate the deployer service account
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository/${REPO}"

# Print values for GitHub
echo "GCP_DEPLOYER_SA = $SA_EMAIL"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER = ${POOL_NAME}/providers/github-provider"
```

Copy the two output values into GitHub repo secrets.

## Verifying

Push any commit to `main` that touches `services/commerce-api/`. The deploy workflow runs and you can watch it in the Actions tab. First run may take 5-10 minutes (cold image build). Subsequent runs ~2-3 minutes.

If it fails, common causes:
- Workload Identity Provider not bound to the repo (check the attribute condition)
- Service account missing a role (re-run the role grants above)
- Secrets not set in Secret Manager yet (see ERPNext setup guide for how to populate them)
