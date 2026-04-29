/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Initial schema for commerce-api.
 *
 * REMEMBER: ERPNext owns products, inventory, orders, suppliers, customer master.
 * commerce-api Postgres only stores what's strictly ours:
 *   - customer auth credentials (so we can issue JWTs)
 *   - M-Pesa transaction logs (for reconciliation, since these are ours)
 *   - idempotency keys (so retries are safe)
 */

exports.up = (pgm) => {
  pgm.createExtension('uuid-ossp', { ifNotExists: true });

  // --- customers_auth ---------------------------------------------------------
  // Maps email + password to an ERPNext customer id. Profile data lives in ERPNext.
  pgm.createTable('customers_auth', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    email: { type: 'citext', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    erpnext_customer_id: { type: 'text', notNull: true, unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_login_at: { type: 'timestamptz' },
  });

  // --- mpesa_transactions -----------------------------------------------------
  // Every Daraja STK push and callback we observe.
  pgm.createTable('mpesa_transactions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    cart_id: { type: 'text', notNull: true },
    quotation_id: { type: 'text' },
    sales_order_id: { type: 'text' },
    phone: { type: 'text', notNull: true },
    amount_cents: { type: 'integer', notNull: true },
    status: {
      type: 'text',
      notNull: true,
      check: "status IN ('initiated', 'confirmed', 'failed', 'timeout')",
    },
    checkout_request_id: { type: 'text', unique: true },
    merchant_request_id: { type: 'text' },
    mpesa_receipt: { type: 'text', unique: true },
    raw_callback: { type: 'jsonb' },
    failure_reason: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    confirmed_at: { type: 'timestamptz' },
  });
  pgm.createIndex('mpesa_transactions', 'cart_id');
  pgm.createIndex('mpesa_transactions', 'status');

  // --- idempotency_keys -------------------------------------------------------
  pgm.createTable('idempotency_keys', {
    key: { type: 'text', primaryKey: true },
    request_hash: { type: 'text', notNull: true },
    response_status: { type: 'integer', notNull: true },
    response_body: { type: 'jsonb', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
  });
  pgm.createIndex('idempotency_keys', 'expires_at');
};

exports.down = (pgm) => {
  pgm.dropTable('idempotency_keys');
  pgm.dropTable('mpesa_transactions');
  pgm.dropTable('customers_auth');
};
