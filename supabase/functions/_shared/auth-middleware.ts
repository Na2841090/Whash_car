// supabase/functions/_shared/auth-middleware.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { validateToken } from './token-service.ts';
import { corsHeaders } from './constants.ts';

// ============================================
// OBTER USUÁRIO AUTENTICADO
// ============================================
export async function getAuthenticatedUser(req: Request): Promise<any> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];

  // 🔥 VALIDAR TOKEN (usando token-service)
  const payload = await validateToken(token);

  if (!payload) {
    return null;
  }

  // Buscar usuário no banco
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  );

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', payload.userId)
    .eq('is_active', true)
    .single();

  if (error || !user) {
    return null;
  }

  return user;
}

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================
export async function authMiddleware(req: Request) {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Unauthorized - Invalid or expired token',
      }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  return user;
}

// ============================================
// MIDDLEWARE COM ROLE (Admin/Washer/Client)
// ============================================
export async function authMiddlewareWithRole(req: Request, allowedRoles: string[]) {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Unauthorized - Invalid or expired token',
      }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  // Verificar role do usuário
  const userRole = user.role || 'client';
  if (!allowedRoles.includes(userRole)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Forbidden - Insufficient permissions',
      }),
      {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  return user;
}