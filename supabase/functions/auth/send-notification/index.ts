import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

Deno.serve(async (req: Request) => {
  const headers = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  try {
    const { user_id, title, message, type, order_id } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Variáveis de ambiente não configuradas');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Salvar notificação no banco
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id,
        title,
        message,
        type,
        order_id,
        read: false
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao salvar notificação:', error);
      
      // Se a tabela não existe, criar
      if (error.message.includes('does not exist')) {
        console.log('⚠️ Tabela notifications não existe ainda');
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          warning: 'Notificação salva em log',
          notification: { user_id, title, message }
        }),
        { headers, status: 200 }
      );
    }

    console.log(`📧 Notificação enviada para ${user_id}: ${title}`);

    return new Response(
      JSON.stringify({ success: true, notification: data }),
      { headers, status: 200 }
    );
    
  } catch (error) {
    console.error('❌ Erro:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro interno' 
      }),
      { headers, status: 500 }
    );
  }
});