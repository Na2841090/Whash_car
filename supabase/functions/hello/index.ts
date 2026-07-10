// supabase/functions/hello/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { authMiddleware, decodeJWT, extractToken, corsHeaders } from '../_shared/auth.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    // 🔥 ROTA: decode
    if (path === 'decode') {
      const { token, error } = extractToken(req);
      
      if (error) {
        return new Response(
          JSON.stringify({ success: false, error }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const decoded = decodeJWT(token!);
      return new Response(
        JSON.stringify({
          success: decoded.success,
          ...(decoded.success && {
            header: decoded.header,
            payload: decoded.payload,
            plain_text: decoded.plain_text,
          }),
          ...(!decoded.success && { error: decoded.error }),
        }),
        { 
          status: decoded.success ? 200 : 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // 🔥 ROTA: hello (pública)
    if (path === 'hello' || path === '') {
      const auth = await authMiddleware(req);
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Olá! Teste concluído com sucesso! 🎉',
          timestamp: new Date().toISOString(),
          authenticated: !auth.error,
          ...(auth.user && {
            user: {
              id: auth.user.id,
              email: auth.user.email,
              firstName: auth.user.first_name,
              lastName: auth.user.last_name,
            }
          }),
          endpoints: {
            hello: 'GET /hello - Informações gerais',
            decode: 'GET /decode - Decodifica o token (precisa de Authorization)',
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 🔥 ROTA: test
    else if (path === 'test') {
      const auth = await authMiddleware(req);
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Teste concluído! Tudo funcionando! ✅',
          timestamp: new Date().toISOString(),
          authenticated: !auth.error,
          ...(auth.user && {
            user: {
              id: auth.user.id,
              email: auth.user.email,
              firstName: auth.user.first_name,
              lastName: auth.user.last_name,
            }
          }),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    else {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Rota não encontrada. Use /hello, /test ou /decode',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('Hello error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});