import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // Use service_role key para admin
);

async function createTestUser() {
  console.log('👤 Criando usuário de teste...');

  const { data, error } = await supabase.auth.admin.createUser({
    email: 'cliente@teste.com',
    password: 'Teste123!',
    email_confirm: true,
    user_metadata: {
      full_name: 'Cliente Teste',
      role: 'client'
    }
  });

  if (error) {
    console.error('❌ Erro:', error.message);
  } else {
    console.log('✅ Usuário criado:', data.user.email);
    console.log('📝 Senha: Teste123!');
    
    // Criar perfil automaticamente (trigger vai fazer isso)
    // Mas vamos garantir
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: data.user.id,
        role: 'client',
        full_name: 'Cliente Teste',
        preferred_language: 'en'
      });
    
    if (profileError) {
      console.log('⚠️ Perfil:', profileError.message);
    } else {
      console.log('✅ Perfil criado');
    }
  }
}

createTestUser();