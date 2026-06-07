-- TIME-NG Database Schema
-- Run: node migrations/run.js

-- ─── EXTENSIONS ───────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for search

-- ─── ENUMS ────────────────────────────────────────────────
CREATE TYPE order_status AS ENUM (
  'pending', 'payment_confirmed', 'processing',
  'shipped', 'delivered', 'cancelled', 'refunded'
);

CREATE TYPE payment_status AS ENUM (
  'pending', 'paid', 'failed', 'refunded'
);

CREATE TYPE admin_role AS ENUM (
  'super_admin', 'admin', 'manager'
);

-- ─── CUSTOMERS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  phone         VARCHAR(20),
  full_name     VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  is_verified   BOOLEAN DEFAULT FALSE,
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_phone ON customers(phone);

-- ─── ADMINS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          admin_role DEFAULT 'admin',
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  last_ip       INET,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admins_email ON admins(email);

-- ─── BRANDS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) UNIQUE NOT NULL,
  slug        VARCHAR(255) UNIQUE NOT NULL,
  logo_url    TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PRODUCTS (WATCHES) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id        UUID REFERENCES brands(id) ON DELETE SET NULL,
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(255) UNIQUE NOT NULL,
  sku             VARCHAR(100) UNIQUE,
  price           NUMERIC(15, 2) NOT NULL CHECK (price > 0),
  description     TEXT,
  specifications  JSONB DEFAULT '{}',
  images          JSONB DEFAULT '[]',  -- [{url, public_id, is_primary}]
  stock_qty       INTEGER DEFAULT 0 CHECK (stock_qty >= 0),
  is_featured     BOOLEAN DEFAULT FALSE,
  is_active       BOOLEAN DEFAULT TRUE,
  category        VARCHAR(100),
  movement_type   VARCHAR(100),
  case_size_mm    NUMERIC(5,1),
  case_material   VARCHAR(100),
  water_resistance VARCHAR(50),
  meta_title      VARCHAR(255),
  meta_description TEXT,
  view_count      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_is_active ON products(is_active);
CREATE INDEX idx_products_is_featured ON products(is_featured);
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_name_search ON products USING gin(name gin_trgm_ops);

-- ─── DELIVERY ADDRESSES ───────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_addresses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id  UUID REFERENCES customers(id) ON DELETE CASCADE,
  full_name    VARCHAR(255) NOT NULL,
  phone        VARCHAR(20) NOT NULL,
  address_line TEXT NOT NULL,
  city         VARCHAR(100) NOT NULL,
  state        VARCHAR(100) NOT NULL,
  country      VARCHAR(100) DEFAULT 'Nigeria',
  is_default   BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_addresses_customer ON delivery_addresses(customer_id);

-- ─── ORDERS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_ref           VARCHAR(50) UNIQUE NOT NULL,  -- ORD-2024-00045
  customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name       VARCHAR(255) NOT NULL,  -- snapshot
  customer_email      VARCHAR(255) NOT NULL,  -- snapshot
  customer_phone      VARCHAR(20),
  delivery_address    JSONB NOT NULL,         -- full snapshot
  subtotal            NUMERIC(15,2) NOT NULL,
  delivery_fee        NUMERIC(15,2) DEFAULT 0,
  total_amount        NUMERIC(15,2) NOT NULL,
  status              order_status DEFAULT 'pending',
  payment_status      payment_status DEFAULT 'pending',
  payment_ref         VARCHAR(255),           -- Korapay reference
  payment_channel     VARCHAR(50),
  paid_at             TIMESTAMPTZ,
  notes               TEXT,
  tracking_updates    JSONB DEFAULT '[]',     -- [{status, note, timestamp}]
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_ref ON orders(order_ref);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_ref ON orders(payment_ref);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- ─── ORDER ITEMS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id      UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name  VARCHAR(255) NOT NULL,  -- snapshot
  product_image TEXT,                   -- snapshot
  unit_price    NUMERIC(15,2) NOT NULL, -- snapshot at time of purchase
  quantity      INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  subtotal      NUMERIC(15,2) NOT NULL
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- ─── AUDIT LOGS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    UUID,
  actor_type  VARCHAR(20),  -- 'admin' | 'customer' | 'system'
  actor_email VARCHAR(255),
  action      VARCHAR(100) NOT NULL,
  entity      VARCHAR(100),
  entity_id   UUID,
  metadata    JSONB DEFAULT '{}',
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- ─── PAYMENT IDEMPOTENCY ──────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_ref   VARCHAR(255) UNIQUE NOT NULL,
  event_type    VARCHAR(50) NOT NULL,
  payload       JSONB NOT NULL,
  processed     BOOLEAN DEFAULT FALSE,
  processed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_events_ref ON payment_events(payment_ref);

-- ─── AUTO UPDATE updated_at ───────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_admins_updated BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ORDER REF SEQUENCE ───────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS order_ref_seq START 1000;

-- ─── SEED BRANDS ──────────────────────────────────────────
INSERT INTO brands (name, slug) VALUES
  ('Patek Philippe', 'patek-philippe'),
  ('Rolex', 'rolex'),
  ('Audemars Piguet', 'audemars-piguet'),
  ('Richard Mille', 'richard-mille'),
  ('Franck Muller', 'franck-muller'),
  ('Hublot', 'hublot'),
  ('IWC', 'iwc'),
  ('Omega', 'omega')
ON CONFLICT (slug) DO NOTHING;
