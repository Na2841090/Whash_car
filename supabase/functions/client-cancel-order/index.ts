// supabase/functions/client-cancel-order/index.ts
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

    // 🔥 2. READ BODY
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON body',
          details: parseError.message,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { orderId, reason } = body;

    if (!orderId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required field: orderId',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 3. GET USER
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const userId = decoded.payload.userId || decoded.payload.sub;

    // 🔥 4. GET ORDER
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('client_id', userId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Order not found',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 5. CHECK IF CANCELABLE
    const cancelableStatuses = ['PENDING', 'ACCEPTED'];
    if (!cancelableStatuses.includes(order.status)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Order cannot be cancelled. Current status: ${order.status}`,
          allowed_statuses: cancelableStatuses,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 6. IF ACCEPTED, FREE WASHER
    if (order.status === 'ACCEPTED') {
      await supabase
        .from('washers')
        .update({ is_busy: false })
        .eq('id', order.washer_id);
    }

    // 🔥 7. CANCEL ORDER
    const { data: cancelledOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'CANCELLED',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client_notes: reason || 'Cancelled by client',
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      console.error('Error cancelling order:', updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to cancel order',
          details: updateError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 8. LOG
    await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'client_cancel_order',
        details: {
          order_id: orderId,
          reason: reason || 'No reason provided',
          previous_status: order.status,
        },
        timestamp: new Date().toISOString(),
      });

    // 🔥 9. RETURN SUCCESS
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Order cancelled successfully',
        order: cancelledOrder,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Cancel order error:', error);
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