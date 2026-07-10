-- Índices que faltam (performance critical)
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_washer_status ON orders(washer_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_scheduled ON orders(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_order_status_order ON order_status(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_washer_locations_updated ON washer_locations(updated_at DESC);

-- Índice para full-text search em endereços
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_orders_pickup_trgm ON orders USING gin(pickup_address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_trgm ON orders USING gin(delivery_address gin_trgm_ops);

-- Índice parcial para pedidos ativos
CREATE INDEX IF NOT EXISTS idx_orders_active ON orders(id, status, washer_id) 
WHERE status NOT IN ('completed', 'cancelled');