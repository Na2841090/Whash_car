// supabase/functions/client-get-order/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { decodeJWT, extractToken, corsHeaders } from '../_shared/auth.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 🔥 1. AUTHENTICATION
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

    // 🔥 2. GET USER ID
    const userId = decoded.payload.userId || decoded.payload.sub;

    // 🔥 3. GET ORDER ID FROM QUERY PARAMETER
    const url = new URL(req.url);
    const orderId = url.searchParams.get('orderId');

    if (!orderId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameter: orderId',
          hint: 'Use: ?orderId=YOUR_ORDER_ID',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 4. CREATE SUPABASE CLIENT
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // 🔥 5. FETCH ORDER
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        client:users!client_id(
          id,
          first_name,
          last_name,
          phone,
          email
        ),
        washer:washers!washer_id(
          id,
          user_id,
          rating,
          total_jobs,
          users:user_id(
            first_name,
            last_name,
            phone,
            email
          )
        )
      `)
      .eq('id', orderId)
      .eq('client_id', userId)
      .single();

    if (error || !order) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Order not found',
          details: error?.message || 'Order does not exist or does not belong to you',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 6. RETURN SUCCESS
    return new Response(
      JSON.stringify({
        success: true,
        order: order,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Get order error:', error);
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