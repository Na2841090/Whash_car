// supabase/functions/washer-complete-service/index.ts
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

    const { orderId, signature, postPhotos, checklist } = body;

    if (!orderId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required field: orderId',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 3. GET WASHER
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const userId = decoded.payload.userId || decoded.payload.sub;

    const { data: washer, error: washerError } = await supabase
      .from('washers')
      .select('id, is_active, is_busy, total_jobs, rating')
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

    // 🔥 4. GET ORDER
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('washer_id', washer.id)
      .eq('status', 'IN_PROGRESS')
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Order not found or not in progress',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 5. COMPLETE ORDER
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        digital_signature: signature || null,
        post_service_photos: postPhotos || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      console.error('Error completing service:', updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to complete service',
          details: updateError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 6. UPDATE WASHER (mark as available, increment jobs)
    await supabase
      .from('washers')
      .update({
        is_busy: false,
        total_jobs: (washer.total_jobs || 0) + 1,
      })
      .eq('id', washer.id);

    // 🔥 7. GENERATE CERTIFICATE
    const certificate = {
      order_id: orderId,
      client_id: order.client_id,
      washer_id: washer.id,
      service_type: order.service_type,
      completed_at: new Date().toISOString(),
      signature: signature || 'digital_signature',
    };

    // 🔥 8. LOG
    await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'washer_complete_service',
        details: {
          order_id: orderId,
          washer_id: washer.id,
          certificate: certificate,
        },
        timestamp: new Date().toISOString(),
      });

    // 🔥 9. RETURN SUCCESS
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Service completed successfully! 🎉',
        order: updatedOrder,
        certificate: certificate,
        next_steps: [
          'Client will be notified',
          'Payment will be processed',
          'Please ask for a review',
        ],
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Complete service error:', error);
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