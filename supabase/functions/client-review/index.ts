// supabase/functions/client-review/index.ts
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

    const { orderId, rating, review, recommend } = body;

    if (!orderId || !rating) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: orderId, rating',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (rating < 1 || rating > 5) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Rating must be between 1 and 5',
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
      .select('*, washer:washers!washer_id(rating, total_jobs)')
      .eq('id', orderId)
      .eq('client_id', userId)
      .eq('status', 'COMPLETED')
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Order not found or not completed',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 5. UPDATE ORDER WITH REVIEW
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        client_rating: rating,
        client_review: review || null,
        client_satisfaction: recommend || false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating review:', updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to submit review',
          details: updateError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 6. UPDATE WASHER RATING
    const washerData = order.washer;
    if (washerData) {
      const totalRatings = washerData.total_jobs || 1;
      const currentTotal = (washerData.rating || 0) * totalRatings;
      const newAverage = (currentTotal + rating) / (totalRatings + 1);
      
      await supabase
        .from('washers')
        .update({
          rating: Math.round(newAverage * 100) / 100,
        })
        .eq('id', order.washer_id);
    }

    // 🔥 7. LOG
    await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'client_review',
        details: {
          order_id: orderId,
          rating: rating,
          recommend: recommend || false,
        },
        timestamp: new Date().toISOString(),
      });

    // 🔥 8. RETURN SUCCESS
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Review submitted successfully!',
        review: {
          rating: rating,
          review: review || null,
          recommend: recommend || false,
        },
        washer_rating: {
          new_rating: washerData ? Math.round((washerData.rating || 0) / 2 * 100) / 100 : rating,
        },
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Review error:', error);
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