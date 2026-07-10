import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function test() {
  // Testar inserção
  const { data, error } = await supabase
    .from('services')
    .select('*');
  
  if (error) console.error('Erro:', error);
  else console.log('Serviços:', data);
}

test();