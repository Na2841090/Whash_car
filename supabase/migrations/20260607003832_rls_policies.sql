-- Habilitar RLS em todas as tabelas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Políticas para profiles
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Políticas para vehicles
CREATE POLICY "Users can CRUD own vehicles"
  ON vehicles FOR ALL
  USING (auth.uid() = user_id);

-- Políticas para orders
CREATE POLICY "Clients can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = client_id);

CREATE POLICY "Clients can create orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Washers can view assigned orders"
  ON orders FOR SELECT
  USING (auth.uid() = washer_id);

-- Políticas para photos
CREATE POLICY "Users can view photos of their orders"
  ON photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = photos.order_id
      AND (orders.client_id = auth.uid() OR orders.washer_id = auth.uid())
    )
  );

-- Políticas para reviews
CREATE POLICY "Users can view reviews"
  ON reviews FOR SELECT
  USING (true);

CREATE POLICY "Clients can create reviews for own orders"
  ON reviews FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = reviews.order_id
      AND orders.client_id = auth.uid()
      AND orders.status = 'completed'
    )
  );