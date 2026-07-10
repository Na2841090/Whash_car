import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function addWasher() {
  console.log('🧼 Criando lavador de teste...');

  // 1. Criar usuário lavador
  const { data: auth, error: createError } = await supabase.auth.admin.createUser({
    email: 'lavador@teste.com',
    password: 'Lavador123!',
    email_confirm: true,
    user_metadata: {
      full_name: 'João Lavador',
      role: 'washer'
    }
  });

  if (createError) {
    console.error('❌ Erro ao criar lavador:', createError.message);
    return;
  }

  console.log('✅ Lavador criado:', auth.user.email);

  // 2. Criar perfil do lavador
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: auth.user.id,
      role: 'washer',
      full_name: 'João Lavador',
      phone: '(11) 99999-9999',
      preferred_language: 'pt'
    });

  if (profileError) {
    console.error('❌ Erro no perfil:', profileError.message);
  } else {
    console.log('✅ Perfil do lavador criado');
  }

  // 3. Adicionar localização inicial
  const { error: locationError } = await supabase
    .from('washer_locations')
    .insert({
      washer_id: auth.user.id,
      lat: 34.052235,
      lng: -118.243683,
      updated_at: new Date().toISOString()
    });

  if (locationError) {
    console.log('⚠️ Localização:', locationError.message);
  } else {
    console.log('✅ Localização inicial definida');
  }

  console.log('\n📝 Credenciais do lavador:');
  console.log('Email: lavador@teste.com');
  console.log('Senha: Lavador123!');
}

addWasher();