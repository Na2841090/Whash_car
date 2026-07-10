
-- DEPOIS (otimizado)
CREATE OR REPLACE VIEW v_orders_full AS
SELECT 
  o.id,
  o.client_id,
  p.full_name as client_name,
  o.washer_id,
  w.full_name as washer_name,
  o.vehicle_id,
  v.plate,
  v.brand || ' ' || v.model as vehicle_name,
  o.service_id,
  s.name_en as service_name,
  s.base_price,
  o.total_price,
  o.status,
  o.payment_status,
  o.scheduled_at,
  o.created_at,
  o.pickup_address,
  o.delivery_address
FROM orders o
LEFT JOIN profiles p ON o.client_id = p.id
LEFT JOIN profiles w ON o.washer_id = w.id
LEFT JOIN vehicles v ON o.vehicle_id = v.id
LEFT JOIN services s ON o.service_id = s.id;

-- Usar a view
SELECT * FROM v_orders_full WHERE client_id = '3b7feac1-0e4a-4a3a-b117-fb842d5e078a';