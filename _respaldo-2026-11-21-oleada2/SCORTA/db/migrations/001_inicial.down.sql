-- Deshace 001_inicial. Protección: se niega si existe cualquier empresa, usuario o
-- configuración de plataforma (nunca borra datos reales). La extensión pg_trgm se
-- conserva porque es compartida por la base.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM companies) OR EXISTS (SELECT 1 FROM users) OR EXISTS (SELECT 1 FROM platform_meta) THEN
    RAISE EXCEPTION 'La base contiene datos de SCORTA; 001_inicial.down no se ejecuta sobre datos reales.';
  END IF;
END
$$;

DROP VIEW vehicle_visits;
DROP TABLE receipts;
DROP TABLE cash_closures;
DROP TABLE stock_movements;
DROP TABLE reversals;
DROP TABLE service_lines;
DROP TABLE services;
DROP TABLE sale_labor;
DROP TABLE sale_lines;
DROP TABLE sales;
DROP TABLE purchase_lines;
DROP TABLE purchases;
DROP TABLE product_cost_history;
DROP TABLE products;
DROP TABLE customers;
DROP TABLE mechanics;
DROP TABLE sale_drafts;
DROP TABLE ticket_messages;
DROP TABLE support_tickets;
DROP TABLE audit_log;
DROP TABLE security_events;
DROP TABLE payments;
DROP TABLE idempotency_keys;
DROP TABLE login_throttle;
DROP TABLE sessions;
DROP TABLE users;
DROP TABLE terms_acceptances;
DROP TABLE companies;
DROP TABLE platform_meta;
