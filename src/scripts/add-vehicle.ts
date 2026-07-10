import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function addVehicle() {
  console.log('🚗 Adicionando veículo para o cliente...');

  // 1. Fazer login
  const { data: auth, error: loginError } = await supabase.auth.signInWithPassword({
    email: 'cliente@teste.com',
    password: 'Teste123!'
  });

  if (loginError) {
    console.error('❌ Login falhou:', loginError.message);
    return;
  }

  console.log('✅ Login OK');

  // 2. Buscar perfil do cliente
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', auth.user.id)
    .single();

  // 3. Inserir veículo
  const { data: vehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .insert({
      user_id: auth.user.id,
      plate: 'ABC1234',
      brand: 'Tesla',
      model: 'Model 3',
      year: 2023,
      color: 'Red',
      photo_url: 'https://example.com/tesla.jpg'
    })
    .select()
    .single();

  if (vehicleError) {
    console.error('❌ Erro ao criar veículo:', vehicleError.message);
  } else {
    console.log('✅ Veículo criado:', vehicle.id);
    console.log(`📝 Use este ID nos pedidos: ${vehicle.id}`);
  }
}

addVehicle();