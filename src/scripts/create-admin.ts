import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createAdmin() {
  console.log('👑 Criando administrador...');

  const { data, error } = await supabase.auth.admin.createUser({
    email: 'admin@washcar.com',
    password: 'Admin123!',
    email_confirm: true,
    user_metadata: {
      full_name: 'Administrador',
      role: 'admin'
    }
  });

  if (error) {
    console.error('❌ Erro:', error.message);
    return;
  }

  await supabase
    .from('profiles')
    .upsert({
      id: data.user.id,
      role: 'admin',
      full_name: 'Administrador Sistema',
      preferred_language: 'en'
    });

  console.log('✅ Admin criado!');
  console.log('Email: admin@washcar.com');
  console.log('Senha: Admin123!');
  console.log('\n🔗 Acesse o dashboard: http://127.0.0.1:54323');
}

createAdmin();