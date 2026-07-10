-- Habilitar extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Profiles (estende auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('client', 'washer', 'admin')) DEFAULT 'client',
  full_name TEXT,
  phone TEXT,
  preferred_language TEXT DEFAULT 'en',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vehicles
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  plate TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER,
  color TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Services
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_es TEXT NOT NULL,
  base_price DECIMAL(10,2) NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true
);

-- Extra Services
CREATE TABLE extra_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_es TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true
);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES profiles(id) NOT NULL,
  washer_id UUID REFERENCES profiles(id),
  vehicle_id UUID REFERENCES vehicles(id) NOT NULL,
  service_id UUID REFERENCES services(id) NOT NULL,
  extra_services_ids UUID[] DEFAULT '{}',
  pickup_address TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  same_address BOOLEAN DEFAULT false,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_price DECIMAL(10,2) NOT NULL,
  tip_amount DECIMAL(10,2) DEFAULT 0,
  payment_intent_id TEXT,
  payment_status TEXT DEFAULT 'pending',
  stripe_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order Status Tracking (para Realtime)
CREATE TABLE order_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  lat FLOAT,
  lng FLOAT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Photos (antes/depois)
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('before', 'after')),
  storage_path TEXT NOT NULL,
  taken_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reviews
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Washers location (para rastreamento)
CREATE TABLE washer_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  washer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_orders_client_id ON orders(client_id);
CREATE INDEX idx_orders_washer_id ON orders(washer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_status_order_id ON order_status(order_id);
CREATE INDEX idx_washer_locations_washer_id ON washer_locations(washer_id);

-- Habilitar Realtime na tabela order_status
ALTER TABLE order_status REPLICA IDENTITY FULL;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Inserir serviços padrão
INSERT INTO services (name_en, name_es, base_price, estimated_minutes) VALUES
('Basic Wash', 'Lavado Básico', 29.99, 45),
('Complete Wash', 'Lavado Completo', 59.99, 90),
('Premium Wash', 'Lavado Premium', 99.99, 120);

INSERT INTO extra_services (name_en, name_es, price) VALUES
('Polishing', 'Pulido', 49.99),
('Ceramic Protection', 'Protección Cerámica', 199.99),
('Interior Detailing', 'Detallado Interior', 79.99);