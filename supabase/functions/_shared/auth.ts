// supabase/functions/_shared/auth.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// ============================================
// 🔥 DECODIFICAR JWT (SEM BIBLIOTECAS)
// ============================================
export function decodeJWT(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return {
        success: false,
        error: `Token tem ${parts.length} partes, esperado 3`,
        is_valid_jwt: false,
      };
    }

    const base64UrlDecode = (str: string): string => {
      let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      return atob(base64);
    };

    let header, payload;
    try {
      header = JSON.parse(base64UrlDecode(parts[0]));
      payload = JSON.parse(base64UrlDecode(parts[1]));
    } catch (e) {
      return {
        success: false,
        error: 'Falha ao decodificar JWT: ' + e.message,
        is_valid_jwt: false,
      };
    }

    return {
      success: true,
      is_valid_jwt: true,
      header,
      payload,
      plain_text: {
        userId: payload.userId || payload.sub || null,
        email: payload.email || null,
        firstName: payload.firstName || null,
        lastName: payload.lastName || null,
        state: payload.state || null,
        sessionId: payload.sessionId || null,
        role: payload.role || null,
        exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
        iat: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      is_valid_jwt: false,
    };
  }
}

// ============================================
// 🔥 EXTRAIR TOKEN DO HEADER
// ============================================
export function extractToken(req: Request): { token: string | null; error: string | null } {
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader) {
    return { token: null, error: 'No Authorization header provided' };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { token: null, error: 'Authorization header must be Bearer token' };
  }

  const token = authHeader.split(' ')[1];
  if (!token || token.length < 10) {
    return { token: null, error: 'Invalid token format' };
  }

  return { token, error: null };
}

// ============================================
// 🔥 VALIDAR TOKEN E RETORNAR USUÁRIO
// ============================================
export async function validateTokenAndGetUser(token: string): Promise<{ 
  user: any; 
  payload: any; 
  error: string | null 
}> {
  try {
    // 1. Decodificar JWT
    const decoded = decodeJWT(token);
    
    if (!decoded.success) {
      return { user: null, payload: null, error: decoded.error };
    }

    // 2. Verificar expiração
    const now = Math.floor(Date.now() / 1000);
    if (decoded.payload.exp && decoded.payload.exp < now) {
      return { user: null, payload: null, error: 'Token expired' };
    }

    // 3. Buscar usuário no banco
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const userId = decoded.payload.userId || decoded.payload.sub;
    if (!userId) {
      return { user: null, payload: null, error: 'User ID not found in token' };
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .eq('is_active', true)
      .single();

    if (userError || !user) {
      return { user: null, payload: null, error: 'User not found or inactive' };
    }

    return { 
      user, 
      payload: decoded.payload, 
      error: null 
    };
  } catch (error) {
    return { 
      user: null, 
      payload: null, 
      error: error.message 
    };
  }
}

// ============================================
// 🔥 MIDDLEWARE DE AUTENTICAÇÃO
// ============================================
export async function authMiddleware(req: Request): Promise<{ 
  user: any; 
  payload: any; 
  error: string | null;
  response?: Response;
}> {
  // 1. Extrair token
  const { token, error: tokenError } = extractToken(req);
  if (tokenError) {
    return {
      user: null,
      payload: null,
      error: tokenError,
      response: new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Unauthorized - ' + tokenError 
        }),
        { 
          status: 401, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      )
    };
  }

  // 2. Validar token e obter usuário
  const { user, payload, error } = await validateTokenAndGetUser(token!);
  
  if (error) {
    return {
      user: null,
      payload: null,
      error,
      response: new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Unauthorized - ' + error 
        }),
        { 
          status: 401, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      )
    };
  }

  return { user, payload, error: null };
}

// ============================================
// 🔥 CORS HEADERS
// ============================================
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
};