// supabase/functions/washer-accept-order/index.ts
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

    // 🔥 2. READ BODY (APENAS UMA VEZ)
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('❌ Body parse error:', parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON body',
          details: parseError.message,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 3. VALIDATE BODY
    const { orderId, accept } = body;

    if (!orderId || accept === undefined) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: orderId, accept (boolean)',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 4. GET WASHER
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const userId = decoded.payload.userId || decoded.payload.sub;

    const { data: washer, error: washerError } = await supabase
      .from('washers')
      .select('id, is_active, is_busy, state')
      .eq('user_id', userId)
      .single();

    if (washerError || !washer) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Washer not found',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!washer.is_active) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Washer not active',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (washer.is_busy && accept) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'You are currently busy with another job',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 5. GET ORDER
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('washer_id', washer.id)
      .eq('status', 'PENDING')
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Order not found or not available',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate state
    if (order.state !== washer.state) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `You are not in ${order.state}. You need to be in the same state to accept.`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 6. UPDATE ORDER (APENAS CAMPOS QUE EXISTEM)
    const updateData: any = {
      status: accept ? 'ACCEPTED' : 'CANCELLED',
      updated_at: new Date().toISOString(),
    };

    // Só adicionar accepted_at se a coluna existir
    if (accept) {
      updateData.accepted_at = new Date().toISOString();
    } else {
      updateData.cancelled_at = new Date().toISOString();
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating order:', updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to update order',
          details: updateError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 7. UPDATE WASHER STATUS
    if (accept) {
      await supabase
        .from('washers')
        .update({ is_busy: true })
        .eq('id', washer.id);
    }

    // 🔥 8. LOG
    await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: accept ? 'washer_accept_order' : 'washer_reject_order',
        details: {
          order_id: orderId,
          washer_id: washer.id,
        },
        timestamp: new Date().toISOString(),
      });

    // 🔥 9. RETURN SUCCESS
    return new Response(
      JSON.stringify({
        success: true,
        message: accept ? 'Order accepted successfully!' : 'Order rejected',
        order: updatedOrder,
        washer: {
          id: washer.id,
          is_busy: accept ? true : false,
        },
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Accept order error:', error);
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