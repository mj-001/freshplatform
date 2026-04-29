# ERPNext setup

This guide walks you through standing up an ERPNext instance and configuring it for fresh-platform. Time required: ~30 minutes.

## 1. Create a Frappe Cloud account

[https://frappecloud.com](https://frappecloud.com). Free tier (one site) is enough for development. For production, the **Bench** plan ($25/month) or a self-hosted setup is recommended.

## 2. Create a new ERPNext site

In Frappe Cloud:
1. Click "Create Site"
2. Pick a subdomain (e.g. `freshplatform-dev.frappe.cloud`)
3. Select **ERPNext** as the app to install
4. Region: closest to Nairobi (likely London or Singapore on the free tier)
5. Wait ~5 minutes

## 3. Initial company setup

Log in as Administrator. Run the Setup Wizard:
- Company name: anything (we'll abstract via env vars)
- Country: Kenya
- Currency: KES (Kenyan Shilling)
- Time zone: Africa/Nairobi
- Chart of accounts: Standard

## 4. Enable the features we need

Go to **Stock Settings**:
- Enable **Item Batch No** ✓
- Enable **Item Has Expiry Date** ✓
- Default valuation method: **FIFO** (we override per-item to FEFO via batch selection logic)

Go to **Selling Settings**:
- Default Customer Group: `Individual`
- Default Territory: `Kenya`
- Allow user to edit price in Sales Order: **NO** (price comes from price list)

Go to **Accounts Settings**:
- Default Tax Template: create one for KES with 16% VAT (`KE-VAT-16`)

## 5. Create one warehouse

For now, just one. Multi-warehouse routing is a future-week task.

**Stock → Warehouse → New**:
- Name: `Main Warehouse - YourCompany`
- Type: `Stores`

## 6. Create a few test items

We need at least a handful to test the catalog flow.

**Stock → Item → New** for each:
- Item Code (unique, e.g. `MANGO-APPLE-1KG`)
- Item Name
- Item Group (create as you go: `Produce`, `Dairy`, `Pantry`, etc.)
- Default Unit of Measure (`Kg`, `Nos`, `Bunch`, etc.)
- Maintain Stock: ✓
- Has Batch No: ✓ (for items with expiry)
- Has Expiry Date: ✓
- Shelf Life In Days: e.g. `5` for produce
- Country of Origin: `Kenya`
- Standard Selling Rate: in KES (e.g. `250.00` for 1kg apple mangoes)

Aim for ~20 items spread across Produce, Dairy, Bakery, Pantry, Beverages.

## 7. Create the API key + secret for commerce-api

This is what commerce-api uses to authenticate.

1. Go to **User List** → click your Administrator user (or create a dedicated `commerce-api@yourdomain` user with the **System Manager** role)
2. Scroll to **API Access** section
3. Click **Generate Keys**
4. Copy the **API Key** and **API Secret**
5. Put them in your `.env`:
   ```
   ERPNEXT_URL=https://freshplatform-dev.frappe.cloud
   ERPNEXT_API_KEY=...
   ERPNEXT_API_SECRET=...
   ```

## 8. Test the connection

From the repo root:

```bash
curl -H "Authorization: token $ERPNEXT_API_KEY:$ERPNEXT_API_SECRET" \
     "$ERPNEXT_URL/api/resource/Item?limit_page_length=5"
```

You should see a JSON response with up to 5 items.

## 9. Webhook for catalog cache invalidation

Once commerce-api is deployed, set up a webhook so item changes invalidate our cache.

**Settings → Webhook → New**:
- Webhook DocType: `Item`
- Webhook URL: `https://your-commerce-api-url/webhooks/erpnext/item-updated`
- Request Method: `POST`
- Request Structure: Form URL-Encoded
- Webhook Headers: `X-Webhook-Secret: <generate a random string and put in .env as ERPNEXT_WEBHOOK_SECRET>`
- Trigger on: `After Insert`, `After Update`

## 10. Production differences

For the production ERPNext site (separate from dev):
- Use a paid Frappe Cloud plan or self-host on GCP Compute Engine
- Enable daily backups (built-in on Frappe Cloud paid plans)
- Restrict ERPNext admin access by IP if possible
- Generate a fresh API key/secret for the prod commerce-api service account
- Set up monitoring (Frappe Cloud has built-in uptime monitoring)

## Troubleshooting

**API returns 403**
- API key is correct but the user lacks role permissions. Make sure the user has **System Manager** or at minimum **Sales User** + **Stock User**.

**API returns empty results**
- Check `disabled = 0` filter is being respected. New items default to enabled but if you imported via CSV they may be disabled.

**Webhook doesn't fire**
- Frappe webhooks fire after the document save commits. If commerce-api is on `localhost`, ngrok or similar is needed for local testing.

**Cart `POST /checkout` fails with "Customer not found"**
- Quotations require either a Customer or a Lead. For anonymous carts, commerce-api creates a Quotation with `quotation_to: "Lead"` and a temp lead name.
