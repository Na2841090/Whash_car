import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function listOrders() {
  console.log('📋 Listando pedidos...\n');

  // Login como cliente
  const { data: clientAuth } = await supabase.auth.signInWithPassword({
    email: 'cliente@teste.com',
    password: 'Teste123!'
  });

  if (clientAuth.session) {
    supabase.auth.setSession(clientAuth.session);
  }

  // Buscar pedidos do cliente
  const { data: clientOrders } = await supabase
    .from('orders')
    .select(`
      id,
      status,
      total_price,
      scheduled_at,
      service:services(name_en, name_es),
      vehicle:vehicles(brand, model, plate)
    `)
    .eq('client_id', clientAuth.user?.id)
    .order('created_at', { ascending: false });

  console.log('🚗 Pedidos do cliente:');
  clientOrders?.forEach(order => {
    console.log(`  - ${order.id.slice(0,8)}... | ${order.status} | $${order.total_price} | ${order.vehicle?.plate}`);
  });

  // Login como lavador
  const { data: washerAuth } = await supabase.auth.signInWithPassword({
    email: 'lavador@teste.com',
    password: 'Lavador123!'
  });

  if (washerAuth.session) {
    supabase.auth.setSession(washerAuth.session);
  }

  // Buscar pedidos do lavador
  const { data: washerOrders } = await supabase
    .from('orders')
    .select(`
      id,
      status,
      total_price,
      scheduled_at,
      client:profiles(full_name),
      vehicle:vehicles(brand, model, plate)
    `)
    .eq('washer_id', washerAuth.user?.id);

  console.log('\n🧼 Pedidos do lavador:');
  washerOrders?.forEach(order => {
    console.log(`  - ${order.id.slice(0,8)}... | ${order.status} | Cliente: ${order.client?.full_name}`);
  });
}

listOrders();