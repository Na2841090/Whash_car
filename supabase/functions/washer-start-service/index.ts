// supabase/functions/washer-start-service/index.ts
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

    const { orderId, photos, checklist } = body;

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
      .select('id, is_active, is_busy')
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

    if (!washer.is_busy) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'You are not currently on a job',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 4. GET ORDER
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('washer_id', washer.id)
      .eq('status', 'ACCEPTED')
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Order not found or not accepted',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 5. VALIDATE PHOTOS (8 mandatory)
    const requiredPhotos = [
      'exterior-front', 'exterior-back', 'exterior-left', 'exterior-right',
      'interior-front', 'interior-back', 'interior-left', 'interior-right'
    ];

    if (photos) {
      const photoTypes = photos.map((p: any) => p.type);
      const missingPhotos = requiredPhotos.filter(p => !photoTypes.includes(p));
      
      if (missingPhotos.length > 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Missing required photos',
            missing_photos: missingPhotos,
            required: requiredPhotos,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 🔥 6. UPDATE ORDER
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'IN_PROGRESS',
        started_at: new Date().toISOString(),
        pre_service_photos: photos || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      console.error('Error starting service:', updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to start service',
          details: updateError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 7. LOG
    await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'washer_start_service',
        details: {
          order_id: orderId,
          washer_id: washer.id,
          photos_count: photos?.length || 0,
        },
        timestamp: new Date().toISOString(),
      });

    // 🔥 8. RETURN SUCCESS
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Service started successfully!',
        order: updatedOrder,
        next_steps: [
          'Complete the service',
          'Take after photos',
          'Get digital signature',
          'Complete the service',
        ],
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Start service error:', error);
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