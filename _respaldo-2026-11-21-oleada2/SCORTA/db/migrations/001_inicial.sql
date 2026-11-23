-- SCORTA 001: modelo normalizado inicial (DM-02, SEG-12, BE-27, BE-31).
-- Reglas:
--   * Toda tabla de negocio lleva company_id y su clave primaria empieza por company_id.
--     Las tablas hijas referencian (company_id, id_padre): una línea de la empresa A no
--     puede colgar de un documento de la empresa B, ni por error del código (SEG-12).
--   * Dinero NUMERIC(14,2). Cantidades BIGINT. IDs TEXT (se conservan los actuales).
--   * Momentos del evento en timestamptz; día comercial (America/Bogota) en date.
--   * Lo que no tenga columna propia se guarda en `extra jsonb`: nada se pierde.
-- Ver docs/datos/MODELO.md.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- ---------------------------------------------------------------- plataforma
CREATE TABLE platform_meta (
  id              smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  schema_version  integer NOT NULL DEFAULT 1,
  revision        bigint  NOT NULL DEFAULT 0,
  owner_company   text    NOT NULL,
  owner_contact   text    NOT NULL DEFAULT '',
  owner_origins   text[]  NOT NULL DEFAULT '{}',
  extra           jsonb
);

CREATE TABLE companies (
  id                text PRIMARY KEY,
  name              text NOT NULL,
  slug              text NOT NULL UNIQUE,
  contact           text NOT NULL DEFAULT '',
  nit               text NOT NULL DEFAULT '',
  address           text NOT NULL DEFAULT '',
  email             text NOT NULL DEFAULT '',
  whatsapp          text NOT NULL DEFAULT '',
  logo              text NOT NULL DEFAULT '',          -- data URL hoy; BE-30 lo mueve a R2/S3
  start_date        date NOT NULL,
  end_date          date NOT NULL,
  monthly_fee       numeric(14,2) NOT NULL DEFAULT 0 CHECK (monthly_fee >= 0),
  enabled           boolean NOT NULL DEFAULT true,
  created_at        timestamptz,
  last_login_at     timestamptz,
  exported_at       timestamptz,
  business_revision bigint NOT NULL DEFAULT 0,
  extra             jsonb,
  business_extra    jsonb,
  CHECK (end_date >= start_date)
);
CREATE INDEX companies_name_idx ON companies (lower(name));

CREATE TABLE terms_acceptances (
  company_id   text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version      text NOT NULL,
  accepted_at  timestamptz NOT NULL,
  user_id      text,
  username     text,
  name         text,
  extra        jsonb,
  PRIMARY KEY (company_id, version, accepted_at)
);

CREATE TABLE users (
  id                    text PRIMARY KEY,
  company_id            text REFERENCES companies(id) ON DELETE CASCADE,
  username              text NOT NULL,
  name                  text NOT NULL DEFAULT '',
  email                 text NOT NULL DEFAULT '',
  email_verified        boolean NOT NULL DEFAULT false,
  role                  text NOT NULL CHECK (role IN ('owner','admin','vendedor')),
  active                boolean NOT NULL DEFAULT true,
  password_salt         text NOT NULL,
  password_digest       text NOT NULL,
  password_iterations   integer NOT NULL,
  password_algorithm    text NOT NULL,
  password_changed_at   timestamptz,
  must_change_password  boolean NOT NULL DEFAULT false,
  version               integer NOT NULL DEFAULT 1,
  created_at            timestamptz,
  last_login_at         timestamptz,
  totp_enabled          boolean NOT NULL DEFAULT false,
  totp_secret           text,
  totp_last_counter     bigint,
  totp_enabled_at       timestamptz,
  totp_pending_secret   text,
  totp_pending_at       timestamptz,
  extra                 jsonb,
  CHECK ((role = 'owner') = (company_id IS NULL))
);
CREATE UNIQUE INDEX users_company_username_uq ON users (coalesce(company_id, ''), lower(username));
CREATE INDEX users_company_idx ON users (company_id);

-- BE-31: sesiones en la base (varias instancias). La clave es el SHA-256 del token.
CREATE TABLE sessions (
  token_hash          text PRIMARY KEY,
  user_id             text NOT NULL,
  user_version        integer NOT NULL,
  expires_at          timestamptz NOT NULL,
  support_company_id  text,
  support_reason      text,
  support_started_at  timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  extra               jsonb
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);
CREATE INDEX sessions_support_idx ON sessions (support_company_id) WHERE support_company_id IS NOT NULL;

-- BE-31: límites de intentos (loginFailures, loginOrigins, accountFailures, passwordFailures).
CREATE TABLE login_throttle (
  kind     text NOT NULL CHECK (kind IN ('login','origin','account','password')),
  key      text NOT NULL,
  count    integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  until    timestamptz NOT NULL,
  alerted  boolean NOT NULL DEFAULT false,
  extra    jsonb,
  PRIMARY KEY (kind, key)
);
CREATE INDEX login_throttle_until_idx ON login_throttle (until);

-- Idempotencia (state.requests): INSERT ... ON CONFLICT DO NOTHING dentro de la transacción.
CREATE TABLE idempotency_keys (
  user_id      text NOT NULL,
  request_id   text NOT NULL,
  fingerprint  text NOT NULL,
  company_id   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  result       jsonb,
  PRIMARY KEY (user_id, request_id)
);
CREATE INDEX idempotency_created_idx ON idempotency_keys (created_at);

-- Mensualidades (state.payments).
CREATE TABLE payments (
  id                 text PRIMARY KEY,
  company_id         text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date               date NOT NULL,
  amount             numeric(14,2) NOT NULL CHECK (amount >= 0),
  previous_end_date  date,
  start_date         date,
  end_date           date,
  username           text,
  extra              jsonb
);
CREATE INDEX payments_company_date_idx ON payments (company_id, date);

CREATE TABLE security_events (
  id          text PRIMARY KEY,
  fecha       timestamptz NOT NULL,
  tipo        text NOT NULL,
  company_id  text,                     -- sin FK: el evento sobrevive al borrado de la empresa
  details     jsonb
);
CREATE INDEX security_events_fecha_idx ON security_events (fecha DESC);
CREATE INDEX security_events_company_idx ON security_events (company_id, fecha DESC);

-- Auditoría global (scope 'platform') y por empresa (scope 'business'), DM-07.
CREATE TABLE audit_log (
  seq         bigserial PRIMARY KEY,
  scope       text NOT NULL CHECK (scope IN ('platform','business')),
  company_id  text,                     -- sin FK: el certificado de borrado (BE-09) sobrevive
  id          text NOT NULL,
  fecha       timestamptz NOT NULL,
  usuario     text,
  user_id     text,
  accion      text NOT NULL,
  documento   text,
  motivo      text,
  antes       jsonb,
  despues     jsonb,
  extra       jsonb,
  CHECK (scope = 'platform' OR company_id IS NOT NULL)
);
CREATE INDEX audit_company_fecha_idx ON audit_log (company_id, fecha DESC);
CREATE INDEX audit_scope_fecha_idx ON audit_log (scope, fecha DESC);

-- Tickets de soporte.
CREATE TABLE support_tickets (
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  id            text NOT NULL,
  created_by    text,
  creator_name  text,
  title         text NOT NULL,
  description   text NOT NULL,
  status        text NOT NULL CHECK (status IN ('open','in_progress','resolved')),
  created_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL,
  readers       jsonb NOT NULL DEFAULT '{}',
  extra         jsonb,
  PRIMARY KEY (company_id, id)
);
CREATE INDEX support_tickets_status_idx ON support_tickets (company_id, status, updated_at DESC);

CREATE TABLE ticket_messages (
  company_id  text NOT NULL,
  ticket_id   text NOT NULL,
  seq         integer NOT NULL,
  id          text NOT NULL,
  user_id     text,
  name        text,
  role        text,
  message     text NOT NULL,
  kind        text,
  created_at  timestamptz NOT NULL,
  extra       jsonb,
  PRIMARY KEY (company_id, ticket_id, seq),
  FOREIGN KEY (company_id, ticket_id) REFERENCES support_tickets(company_id, id) ON DELETE CASCADE
);

-- Borradores de venta por usuario (state.saleDrafts; clave [companyId, userId, soporte]).
CREATE TABLE sale_drafts (
  company_id  text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     text NOT NULL,
  support     boolean NOT NULL DEFAULT false,
  version     integer NOT NULL DEFAULT 0,
  draft       jsonb,
  write_id    text,
  sale_id     text,
  updated_at  timestamptz,
  extra       jsonb,
  PRIMARY KEY (company_id, user_id, support)
);

-- ---------------------------------------------------------------- negocio
CREATE TABLE mechanics (
  company_id  text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  id          text NOT NULL,
  name        text NOT NULL,
  percentage  numeric(5,2) CHECK (percentage BETWEEN 0 AND 100),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz,
  updated_at  timestamptz,
  extra       jsonb,
  PRIMARY KEY (company_id, id)
);

CREATE TABLE customers (
  company_id      text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  id              text NOT NULL,
  nombre          text NOT NULL,
  telefono        text NOT NULL DEFAULT '',
  consent_at      timestamptz,
  consent_by      text,
  consent_medium  text,
  erased_at       timestamptz,
  erased_by       text,
  extra           jsonb,
  PRIMARY KEY (company_id, id)
);
CREATE INDEX customers_phone_idx ON customers (company_id, telefono) WHERE telefono <> '';

CREATE TABLE products (
  company_id      text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  id              text NOT NULL,
  nombre          text NOT NULL,
  -- Texto normalizado (minúsculas, sin tildes) de nombre, referencia, marca, modelo,
  -- compatibilidad y código de barras. Lo calcula la aplicación (misma función norm()).
  search_text     text NOT NULL DEFAULT '',
  categoria       text NOT NULL DEFAULT 'General',
  referencia      text NOT NULL DEFAULT '',
  marca           text NOT NULL DEFAULT '',
  modelo          text NOT NULL DEFAULT '',
  compatibilidad  text NOT NULL DEFAULT '',
  codigo_barras   text NOT NULL DEFAULT '',
  precio_compra   numeric(14,2) CHECK (precio_compra >= 0),     -- NULL = costo desconocido
  precio_venta    numeric(14,2) NOT NULL CHECK (precio_venta >= 0),
  stock           bigint NOT NULL DEFAULT 0 CHECK (stock >= 0),  -- BE-27
  stock_minimo    bigint NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  foto            text,                                           -- BE-30 lo mueve fuera
  created_at      timestamptz,
  updated_at      timestamptz,
  extra           jsonb,
  PRIMARY KEY (company_id, id)
);
-- DM-05: búsqueda por subcadena con trigramas (LIKE '%texto%' usa el índice GIN).
CREATE INDEX products_search_trgm_idx ON products USING gin (search_text public.gin_trgm_ops);
CREATE INDEX products_name_idx ON products (company_id, lower(nombre), id);
CREATE INDEX products_reference_idx ON products (company_id, lower(referencia)) WHERE referencia <> '';
CREATE INDEX products_barcode_idx ON products (company_id, codigo_barras) WHERE codigo_barras <> '';
CREATE INDEX products_low_stock_idx ON products (company_id) WHERE stock <= stock_minimo;

CREATE TABLE product_cost_history (
  company_id      text NOT NULL,
  product_id      text NOT NULL,
  seq             integer NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('baseline','manual','purchase')),
  document_id     text,
  costo_unitario  numeric(14,2),
  costo_compra    numeric(14,2),
  cantidad        bigint,
  stock_antes     bigint,
  total           numeric(14,2),
  extra           jsonb,
  PRIMARY KEY (company_id, product_id, seq),
  FOREIGN KEY (company_id, product_id) REFERENCES products(company_id, id) ON DELETE CASCADE
);
CREATE INDEX cost_history_document_idx ON product_cost_history (company_id, document_id) WHERE document_id IS NOT NULL;

CREATE TABLE purchases (
  company_id       text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  id               text NOT NULL,
  fecha            date NOT NULL,                 -- día comercial (Bogotá)
  created_at       timestamptz,
  usuario          text,
  user_id          text,
  proveedor        text NOT NULL DEFAULT 'Sin especificar',
  total            numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  anulada          boolean NOT NULL DEFAULT false,
  estado_anterior  text,
  extra            jsonb,
  PRIMARY KEY (company_id, id)
);
CREATE INDEX purchases_company_fecha_idx ON purchases (company_id, fecha DESC, id DESC);

CREATE TABLE purchase_lines (
  company_id       text NOT NULL,
  purchase_id      text NOT NULL,
  line_no          integer NOT NULL,
  producto_id      text NOT NULL,   -- sin FK: instantánea histórica (ver MODELO.md)
  nombre           text NOT NULL,
  cantidad         bigint NOT NULL CHECK (cantidad > 0),
  precio_unitario  numeric(14,2) NOT NULL CHECK (precio_unitario >= 0),
  costo_unitario   numeric(14,2),
  devuelto         bigint NOT NULL DEFAULT 0 CHECK (devuelto >= 0 AND devuelto <= cantidad),
  extra            jsonb,
  PRIMARY KEY (company_id, purchase_id, line_no),
  FOREIGN KEY (company_id, purchase_id) REFERENCES purchases(company_id, id) ON DELETE CASCADE
);
CREATE INDEX purchase_lines_product_idx ON purchase_lines (company_id, producto_id);

CREATE TABLE sales (
  company_id           text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  id                   text NOT NULL,
  fecha                date NOT NULL,              -- día comercial (Bogotá) de la venta
  created_at           timestamptz,                -- momento real (NULL en datos importados)
  usuario              text,
  user_id              text,
  cliente              text NOT NULL DEFAULT 'Cliente general',
  telefono             text NOT NULL DEFAULT '',
  customer_id          text,
  placa                text NOT NULL DEFAULT '',
  payment_method       text,                        -- efectivo | transferencia | tarjeta (histórico libre)
  subtotal_productos   numeric(14,2),
  subtotal_mano_obra   numeric(14,2),
  total                numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  labor_refund         numeric(14,2),
  anulada              boolean NOT NULL DEFAULT false,
  autorizado_por       text,
  data_consent_at      timestamptz,
  data_consent_by      text,
  data_consent_medium  text,
  receipt_hash         text,
  receipt_expires_at   timestamptz,
  extra                jsonb,
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers(company_id, id)
);
CREATE INDEX sales_company_fecha_idx ON sales (company_id, fecha DESC, id DESC);
CREATE INDEX sales_company_user_idx ON sales (company_id, user_id, fecha DESC);
CREATE INDEX sales_company_customer_idx ON sales (company_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX sales_company_plate_idx ON sales (company_id, placa) WHERE placa <> '';

CREATE TABLE sale_lines (
  company_id       text NOT NULL,
  sale_id          text NOT NULL,
  line_no          integer NOT NULL,
  producto_id      text NOT NULL,
  nombre           text NOT NULL,
  cantidad         bigint NOT NULL CHECK (cantidad > 0),
  precio_unitario  numeric(14,2) NOT NULL CHECK (precio_unitario >= 0),
  costo_unitario   numeric(14,2),
  devuelto         bigint NOT NULL DEFAULT 0 CHECK (devuelto >= 0 AND devuelto <= cantidad),
  extra            jsonb,
  PRIMARY KEY (company_id, sale_id, line_no),
  FOREIGN KEY (company_id, sale_id) REFERENCES sales(company_id, id) ON DELETE CASCADE
);
CREATE INDEX sale_lines_product_idx ON sale_lines (company_id, producto_id);
-- DM-06: el reporte solo necesita las líneas con devoluciones (pocas).
CREATE INDEX sale_lines_returned_idx ON sale_lines (company_id, sale_id) WHERE devuelto > 0;

CREATE TABLE sale_labor (
  company_id           text NOT NULL,
  sale_id              text NOT NULL,
  line_no              integer NOT NULL,
  descripcion          text NOT NULL,
  mecanico_id          text,
  mecanico             text,
  mecanico_porcentaje  numeric(5,2) CHECK (mecanico_porcentaje BETWEEN 0 AND 100),
  importe              numeric(14,2) NOT NULL CHECK (importe >= 0),
  extra                jsonb,
  PRIMARY KEY (company_id, sale_id, line_no),
  FOREIGN KEY (company_id, sale_id) REFERENCES sales(company_id, id) ON DELETE CASCADE
);
CREATE INDEX sale_labor_mechanic_idx ON sale_labor (company_id, mecanico_id);

-- Órdenes de taller: espejo de una venta con mano de obra (venta_id) o servicio histórico.
CREATE TABLE services (
  company_id           text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  id                   text NOT NULL,
  venta_id             text,
  fecha                date NOT NULL,
  fecha_entrega        date,
  usuario              text,
  user_id              text,
  cliente              text NOT NULL DEFAULT 'Cliente general',
  telefono             text NOT NULL DEFAULT '',
  customer_id          text,
  placa                text NOT NULL DEFAULT '',
  marca_moto           text,
  descripcion_trabajo  text,
  mecanico             text,
  costo_mano_obra      numeric(14,2),
  subtotal_productos   numeric(14,2),
  subtotal_mano_obra   numeric(14,2),
  total                numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  estado               text NOT NULL,
  estado_anterior      text,
  payment_method       text,
  anulada              boolean NOT NULL DEFAULT false,
  labor                jsonb,
  extra                jsonb,
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, venta_id) REFERENCES sales(company_id, id)
);
CREATE INDEX services_company_fecha_idx ON services (company_id, fecha DESC);
CREATE INDEX services_company_sale_idx ON services (company_id, venta_id) WHERE venta_id IS NOT NULL;
CREATE INDEX services_company_state_idx ON services (company_id, estado);

CREATE TABLE service_lines (
  company_id       text NOT NULL,
  service_id       text NOT NULL,
  line_no          integer NOT NULL,
  producto_id      text NOT NULL,
  nombre           text NOT NULL,
  cantidad         bigint NOT NULL CHECK (cantidad > 0),
  precio_unitario  numeric(14,2) NOT NULL CHECK (precio_unitario >= 0),
  costo_unitario   numeric(14,2),
  devuelto         bigint NOT NULL DEFAULT 0 CHECK (devuelto >= 0 AND devuelto <= cantidad),
  extra            jsonb,
  PRIMARY KEY (company_id, service_id, line_no),
  FOREIGN KEY (company_id, service_id) REFERENCES services(company_id, id) ON DELETE CASCADE
);

-- Devoluciones parciales y anulaciones de compras, ventas y servicios.
CREATE TABLE reversals (
  company_id       text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_type         text NOT NULL CHECK (doc_type IN ('compra','venta','servicio')),
  doc_id           text NOT NULL,
  seq              integer NOT NULL,
  id               text NOT NULL,
  fecha            timestamptz NOT NULL,       -- momento de la devolución
  fecha_comercial  date,                        -- día comercial en que ocurrió (BE-14)
  after_closure    boolean NOT NULL DEFAULT false,
  usuario          text,
  motivo           text,
  parcial          boolean NOT NULL DEFAULT false,
  detalles         jsonb NOT NULL DEFAULT '[]', -- [{index, cantidad}] sobre las líneas del documento
  extra            jsonb,
  PRIMARY KEY (company_id, doc_type, doc_id, seq)
);
CREATE INDEX reversals_company_fecha_idx ON reversals (company_id, fecha_comercial);

CREATE TABLE stock_movements (
  company_id       text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  id               text NOT NULL,
  fecha            timestamptz NOT NULL,
  fecha_comercial  date GENERATED ALWAYS AS ((fecha AT TIME ZONE 'America/Bogota')::date) STORED,
  producto_id      text NOT NULL,      -- sin FK: el retiro de un producto conserva su apertura
  nombre           text NOT NULL,
  cantidad         bigint NOT NULL,    -- con signo
  tipo             text NOT NULL,
  usuario          text,
  user_id          text,
  stock_antes      bigint,
  stock_despues    bigint,
  tipo_documento   text,
  documento        text,
  motivo           text,
  support_reason   text,
  extra            jsonb,
  PRIMARY KEY (company_id, id)
);
CREATE INDEX stock_movements_company_fecha_idx ON stock_movements (company_id, fecha DESC);
CREATE INDEX stock_movements_product_idx ON stock_movements (company_id, producto_id, fecha DESC);

CREATE TABLE cash_closures (
  company_id         text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  id                 text NOT NULL,
  date               date NOT NULL,
  created_at         timestamptz NOT NULL,
  user_id            text,
  username           text,
  name               text,
  expected_total     numeric(14,2) NOT NULL,
  actual_total       numeric(14,2) NOT NULL,
  difference_total   numeric(14,2) NOT NULL,
  expected           jsonb NOT NULL,   -- snapshot por medio de pago
  actual             jsonb NOT NULL,
  differences        jsonb NOT NULL,
  summary            jsonb,            -- snapshot del reporte del día (gross, returns, net...)
  note               text NOT NULL DEFAULT '',
  business_revision  bigint,
  extra              jsonb,
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id, date)
);

-- Enlaces públicos de comprobante (SEG-03): solo el hash del token.
CREATE TABLE receipts (
  token_hash  text PRIMARY KEY,
  company_id  text NOT NULL,
  sale_id     text NOT NULL,
  expires_at  timestamptz NOT NULL,
  extra       jsonb,
  FOREIGN KEY (company_id, sale_id) REFERENCES sales(company_id, id) ON DELETE CASCADE
);
CREATE INDEX receipts_sale_idx ON receipts (company_id, sale_id);
CREATE INDEX receipts_expires_idx ON receipts (expires_at);

-- Vehículos: no hay entidad propia en el JSON (se agregan desde las ventas). Vista de consulta.
CREATE VIEW vehicle_visits AS
  SELECT company_id, placa, count(*) AS visit_count, max(fecha) AS last_visit,
         array_agg(DISTINCT customer_id) FILTER (WHERE customer_id IS NOT NULL) AS customer_ids
  FROM sales
  WHERE placa <> '' AND NOT anulada
  GROUP BY company_id, placa;
