// supabase/functions/washer-orders/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { decodeJWT, extractToken, corsHeaders } from '../_shared/auth.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 🔥 AUTHENTICATION
    const { token, error: tokenError } = extractToken(req);
    if (tokenError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - ' + tokenError }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const decoded = decodeJWT(token!);
    if (!decoded.success) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const userId = decoded.payload.userId || decoded.payload.sub;

    // Buscar washer do usuário
    const { data: washer, error: washerError } = await supabase
      .from('washers')
      .select('id, is_active, is_busy')
      .eq('user_id', userId)
      .single();

    if (washerError || !washer) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Washer not found',
          details: 'User is not registered as a washer',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!washer.is_active) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Washer not active',
          details: 'Your account is pending approval',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parâmetros de query
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Buscar pedidos do washer
    let query = supabase
      .from('orders')
      .select('*, client:users!client_id(first_name, last_name, phone, email)')
      .eq('washer_id', washer.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error('Error fetching orders:', error);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch orders' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        orders: orders || [],
        washer: {
          id: washer.id,
          is_active: washer.is_active,
          is_busy: washer.is_busy,
        },
        pagination: {
          limit,
          offset,
          total: orders?.length || 0,
        },
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Washer orders error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});