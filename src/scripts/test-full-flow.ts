import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function testFullFlow() {
  console.log('🚗 Testando fluxo completo...\n');

  // 1. Login
  console.log('1️⃣ Fazendo login...');
  const { data: auth, error: loginError } = await supabase.auth.signInWithPassword({
    email: 'cliente@teste.com',
    password: 'Teste123!'
  });

  if (loginError) {
    console.error('❌ Login falhou:', loginError.message);
    return;
  }

  console.log('✅ Login OK:', auth.user.email);

  // 2. Buscar veículos do cliente
  console.log('\n2️⃣ Buscando veículos...');
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('*')
    .eq('user_id', auth.user.id);

  if (!vehicles || vehicles.length === 0) {
    console.error('❌ Nenhum veículo encontrado. Execute src/add-vehicle.ts primeiro');
    return;
  }

  console.log('✅ Veículo encontrado:', vehicles[0].plate);

  // 3. Listar serviços
  console.log('\n3️⃣ Buscando serviços...');
  const { data: services } = await supabase
    .from('services')
    .select('*');
  
  console.log('✅ Serviços encontrados:', services?.length);

  // 4. Criar pedido com vehicle_id real
  console.log('\n4️⃣ Criando pedido...');
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      client_id: auth.user.id,
      vehicle_id: vehicles[0].id,  // Usando ID real do veículo
      service_id: services?.[0]?.id,
      pickup_address: '123 Main St, Los Angeles, CA 90001',
      delivery_address: '456 Oak Ave, Los Angeles, CA 90001',
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      total_price: 29.99,
      status: 'pending',
      payment_status: 'pending'
    })
    .select()
    .single();

  if (orderError) {
    console.error('❌ Erro ao criar pedido:', orderError.message);
  } else {
    console.log('✅ Pedido criado:', order.id);
  }

  // 5. Testar Edge Function de preço
  console.log('\n5️⃣ Testando Edge Function...');
  
  // Verificar se a function está rodando
  try {
    const response = await fetch('http://127.0.0.1:54321/functions/v1/calculate-price', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.session?.access_token}`
      },
      body: JSON.stringify({
        service_id: services?.[0]?.id,
        extras_ids: [],
        pickup_address: '123 Main St',
        delivery_address: '456 Oak Ave'
      })
    });

    if (response.ok) {
      const priceResult = await response.json();
      console.log('✅ Preço calculado:', priceResult);
    } else {
      console.error('❌ Function retornou erro:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Detalhes:', errorText);
    }
  } catch (error) {
    console.error('❌ Não foi possível conectar à Edge Function');
    console.log('💡 Certifique-se de executar: supabase functions serve --no-verify-jwt');
  }

  console.log('\n🎉 Fluxo completo testado!');
}

testFullFlow();