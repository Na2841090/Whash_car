-- Criar tabela de logs de performance
CREATE TABLE IF NOT EXISTS performance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT,
  method TEXT,
  response_time_ms INT,
  status_code INT,
  user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para consultas rápidas
CREATE INDEX idx_performance_logs_created ON performance_logs(created_at DESC);
CREATE INDEX idx_performance_logs_endpoint ON performance_logs(endpoint);

-- Função para log automático (usar via trigger ou middleware)
CREATE OR REPLACE FUNCTION log_performance(
  p_endpoint TEXT,
  p_method TEXT,
  p_response_time_ms INT,
  p_status_code INT,
  p_user_id UUID DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO performance_logs (endpoint, method, response_time_ms, status_code, user_id)
  VALUES (p_endpoint, p_method, p_response_time_ms, p_status_code, p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;