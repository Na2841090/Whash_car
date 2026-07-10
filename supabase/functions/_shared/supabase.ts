// supabase/functions/auth-login/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { corsHeaders, US_STATES } from '../_shared/constants.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, password } = await req.json();

    // Validar entrada
    if (!email || !password) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Email and password required' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Criar cliente Supabase
    const supabase = createSupabaseClient();

    // 🔥 LOGIN
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: error.message,
          code: error.status
        }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Buscar perfil do usuário
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*, state, zip_code, preferred_language')
      .eq('id', data.user.id)
      .single();

    if (userError) {
      console.error('Error fetching user data:', userError);
    }

    // Verificar se é lavador
    const { data: washerData } = await supabase
      .from('washers')
      .select('id, is_active, state, worker_classification')
      .eq('user_id', data.user.id)
      .single();

    // Registrar log de auditoria
    await supabase
      .from('audit_logs')
      .insert({
        user_id: data.user.id,
        action: 'login',
        ip: req.headers.get('x-forwarded-for') || 'unknown',
        user_agent: req.headers.get('user-agent') || 'unknown',
        timestamp: new Date().toISOString(),
      });

    // Retornar sucesso
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email,
          first_name: userData?.first_name,
          last_name: userData?.last_name,
          phone: userData?.phone,
          state: userData?.state,
          zip_code: userData?.zip_code,
          preferred_language: userData?.preferred_language || 'en',
          is_washer: !!washerData,
          washer: washerData || null,
        },
        session: data.session,
        state_info: userData?.state ? US_STATES[userData.state] : null,
        timezone: userData?.state ? US_STATES[userData.state]?.timezone : 'EST',
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Login error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});