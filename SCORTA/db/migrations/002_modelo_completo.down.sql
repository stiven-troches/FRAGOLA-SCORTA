-- Deshace 002_modelo_completo. Protección: se niega si alguna de las tablas nuevas tiene filas o
-- si las columnas nuevas de las tablas existentes tienen datos (nunca borra datos reales: exporta
-- antes con db/export-json.mjs). No toca nada de 001.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM sale_payments) OR EXISTS (SELECT 1 FROM sale_vat_rates) OR EXISTS (SELECT 1 FROM sale_credit)
     OR EXISTS (SELECT 1 FROM reversal_refunds) OR EXISTS (SELECT 1 FROM cash_movements) OR EXISTS (SELECT 1 FROM credit_payments)
     OR EXISTS (SELECT 1 FROM layaways) OR EXISTS (SELECT 1 FROM quotes) OR EXISTS (SELECT 1 FROM warranties)
     OR EXISTS (SELECT 1 FROM suppliers) OR EXISTS (SELECT 1 FROM purchase_orders) OR EXISTS (SELECT 1 FROM purchase_credit)
     OR EXISTS (SELECT 1 FROM supplier_payments)
     OR EXISTS (SELECT 1 FROM customers WHERE credit_limit IS NOT NULL OR saldo_a_favor IS NOT NULL OR tipo IS NOT NULL OR numero_documento IS NOT NULL OR correo IS NOT NULL)
     OR EXISTS (SELECT 1 FROM products WHERE stock_reservado IS NOT NULL OR stock_garantia IS NOT NULL OR precios IS NOT NULL OR tarifa_iva IS NOT NULL OR garantia_dias IS NOT NULL)
     OR EXISTS (SELECT 1 FROM sales WHERE descuentos IS NOT NULL OR iva_incluido IS NOT NULL OR efectivo_recibido IS NOT NULL OR numero_documento IS NOT NULL)
     OR EXISTS (SELECT 1 FROM companies WHERE settings IS NOT NULL OR sequences IS NOT NULL) THEN
    RAISE EXCEPTION 'La base contiene datos del modelo completo; 002_modelo_completo.down no se ejecuta sobre datos reales.';
  END IF;
END
$$;

DROP INDEX idempotency_company_idx;
ALTER TABLE idempotency_keys DROP CONSTRAINT idempotency_keys_company_fk;

DROP TABLE warranty_history;
DROP TABLE warranties;
DROP TABLE quote_lines;
DROP TABLE quotes;
DROP TABLE layaway_payments;
DROP TABLE layaway_lines;
DROP TABLE layaways;
DROP TABLE credit_payment_applications;
DROP TABLE credit_payments;
DROP TABLE reversal_refunds;
DROP TABLE sale_credit;
DROP TABLE sale_vat_rates;
DROP VIEW sale_payment_lines;
DROP TABLE sale_payments;
DROP TABLE supplier_payment_applications;
DROP TABLE supplier_payments;
DROP TABLE cash_movements;
DROP TABLE purchase_order_history;
DROP TABLE purchase_order_receipts;
DROP TABLE purchase_order_lines;
DROP TABLE purchase_orders;
DROP TABLE purchase_credit;

ALTER TABLE purchases DROP COLUMN supplier_id, DROP COLUMN factura, DROP COLUMN orden_compra_id, DROP COLUMN orden_compra_numero;
DROP TABLE suppliers;

ALTER TABLE reversals DROP COLUMN refund_total, DROP COLUMN refund_credit, DROP COLUMN refund_derived, DROP COLUMN garantia_id;
ALTER TABLE sale_lines DROP COLUMN precio_lista, DROP COLUMN precio_modificado, DROP COLUMN descuento, DROP COLUMN tarifa_iva;
ALTER TABLE sales
  DROP COLUMN descuentos, DROP COLUMN descuento_total, DROP COLUMN efectivo_recibido, DROP COLUMN vueltas, DROP COLUMN tipo_documento,
  DROP COLUMN numero_documento, DROP COLUMN tipo_cliente, DROP COLUMN cotizacion_id, DROP COLUMN cotizacion_numero, DROP COLUMN separado_id,
  DROP COLUMN separado_numero, DROP COLUMN iva_incluido, DROP COLUMN iva_precios_con_iva, DROP COLUMN iva_tarifa_mano_obra, DROP COLUMN iva_total;
ALTER TABLE products
  DROP COLUMN descripcion, DROP COLUMN stock_reservado, DROP COLUMN stock_garantia, DROP COLUMN garantia_dias, DROP COLUMN tarifa_iva, DROP COLUMN precios;
ALTER TABLE customers
  DROP COLUMN tipo, DROP COLUMN tipo_documento, DROP COLUMN numero_documento, DROP COLUMN correo, DROP COLUMN credit_limit, DROP COLUMN credit_days, DROP COLUMN saldo_a_favor;
ALTER TABLE companies DROP COLUMN settings, DROP COLUMN sequences;

ALTER TABLE cash_closures   DROP COLUMN seq;
ALTER TABLE stock_movements DROP COLUMN seq;
ALTER TABLE services        DROP COLUMN seq;
ALTER TABLE sales           DROP COLUMN seq;
ALTER TABLE purchases       DROP COLUMN seq;
ALTER TABLE products        DROP COLUMN seq;
ALTER TABLE customers       DROP COLUMN seq;
ALTER TABLE mechanics       DROP COLUMN seq;
ALTER TABLE support_tickets DROP COLUMN seq;
ALTER TABLE security_events DROP COLUMN seq;
ALTER TABLE payments        DROP COLUMN seq;
ALTER TABLE users           DROP COLUMN seq;
ALTER TABLE companies       DROP COLUMN seq;

DROP TABLE payment_methods;
