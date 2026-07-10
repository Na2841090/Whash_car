// supabase/functions/client-create-order/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { decodeJWT, extractToken, corsHeaders } from '../_shared/auth.ts';

// ============================================
// CONSTANTS
// ============================================
const US_STATES: Record<string, any> = {
  CA: { name: 'California', salesTax: 0.0825, avgPrice: 70, platformFee: 0.25 },
  TX: { name: 'Texas', salesTax: 0.0625, avgPrice: 55, platformFee: 0.20 },
  FL: { name: 'Florida', salesTax: 0.06, avgPrice: 50, platformFee: 0.22 },
  NY: { name: 'New York', salesTax: 0.08875, avgPrice: 75, platformFee: 0.25 },
  NV: { name: 'Nevada', salesTax: 0.0825, avgPrice: 50, platformFee: 0.20 },
  OR: { name: 'Oregon', salesTax: 0.0, avgPrice: 45, platformFee: 0.18 },
  WA: { name: 'Washington', salesTax: 0.1025, avgPrice: 65, platformFee: 0.23 },
};

// ============================================
// SERVE
// ============================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    console.log(`📝 Client-Create-Order: ${req.method} ${path}`);

    if (path === 'create' && req.method === 'POST') {
      return await handleCreateOrder(req);
    }

    if (path === 'health' || path === '') {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Client-Create-Order service is running! 🚗',
          timestamp: new Date().toISOString(),
          endpoints: {
            'POST /create': 'Create order with selected category',
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Route not found',
        available: {
          'POST /create': 'Create order',
        },
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Client-Create-Order error:', error);
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

// ============================================
// HANDLER: CREATE ORDER
// ============================================
async function handleCreateOrder(req: Request) {
  try {
    // 🔥 1. AUTHENTICATION
    const authResult = await authenticate(req);
    if (authResult.error) {
      return new Response(
        JSON.stringify({ success: false, error: authResult.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = authResult.user;
    console.log('✅ User authenticated:', user.email);

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

    const {
      serviceType,
      vehicleId,
      address,
      scheduledDate,
      categorySlug,
      clientNotes,
    } = body;

    // Validate required fields
    if (!serviceType || !vehicleId || !address || !scheduledDate || !categorySlug) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields',
          required: ['serviceType', 'vehicleId', 'address', 'scheduledDate', 'categorySlug'],
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate state
    const state = US_STATES[address.state];
    if (!state) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid state: ${address.state}`,
          available_states: Object.keys(US_STATES),
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // 🔥 3. FETCH CATEGORY
    let category = null;
    let categoryError = null;

    // Try by slug first
    const { data: categoryBySlug, error: errorBySlug } = await supabase
      .from('vehicle_classification')
      .select('*')
      .eq('slug', categorySlug)
      .single();

    if (errorBySlug || !categoryBySlug) {
      // Try by tag
      const tagSlug = categorySlug.toUpperCase().replace(/-/g, '_');
      const { data: categoryByTag, error: errorByTag } = await supabase
        .from('vehicle_classification')
        .select('*')
        .eq('tag', tagSlug)
        .single();

      if (errorByTag || !categoryByTag) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Category not found',
            slug: categorySlug,
            hint: 'Use a valid slug from /vehicle-categories/list',
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      category = categoryByTag;
    } else {
      category = categoryBySlug;
    }

    console.log(`📊 Category found: ${category.name} (${category.tag})`);

    // 🔥 4. DIMENSIONS FROM CATEGORY
    const vehicleLength = category.avg_length || (category.min_length + category.max_length) / 2;
    const vehicleWeight = category.avg_weight || (category.min_weight + category.max_weight) / 2;
    const estimatedDuration = category.avg_wash_time_min;

    // 🔥 5. FIND AVAILABLE WASHER
    const { data: washers, error: washerError } = await supabase
      .from('washers')
      .select('*, users:user_id(first_name, last_name, phone, email)')
      .eq('state', address.state)
      .eq('is_active', true)
      .eq('is_busy', false)
      .order('rating', { ascending: false })
      .limit(1);

    if (washerError) {
      console.error('Washer error:', washerError);
    }

    if (!washers || washers.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No washers available in your area',
          alert: {
            type: 'no_washers_available',
            message: 'No washers available in your area at the moment.',
          },
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const washer = washers[0];

    // 🔥 6. CALCULATE PRICE
    const basePrice = category.base_price;
    const priceAdjustment = state.avgPrice / 50;
    const adjustedBase = Math.round(basePrice * priceAdjustment * 100) / 100;
    const salesTax = Math.round(adjustedBase * state.salesTax * 100) / 100;
    const platformFee = Math.round(adjustedBase * state.platformFee * 100) / 100;
    const total = Math.round((adjustedBase + salesTax + platformFee) * 100) / 100;

    // 🔥 7. CREATE ORDER
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        client_id: user.id,
        washer_id: washer.id,
        service_type: serviceType,
        vehicle_id: vehicleId,
        vehicle_category: category.tag,
        vehicle_length: vehicleLength,
        vehicle_weight: vehicleWeight,
        address: address,
        state: address.state,
        scheduled_date: scheduledDate,
        estimated_duration: estimatedDuration,
        price: {
          base: adjustedBase,
          state_tax: salesTax,
          platform_fee: platformFee,
          total: total,
          currency: 'USD',
          category: category.tag,
          category_name: category.name,
        },
        status: 'PENDING',
        client_notes: clientNotes || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to create order',
          details: orderError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📱 Notifying washer ${washer.id} about order ${order.id}`);

    // 🔥 8. RETURN SUCCESS
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Order created successfully! 🎉',
        order: {
          id: order.id,
          order_number: order.order_number,
          client_id: order.client_id,
          washer_id: order.washer_id,
          service_type: order.service_type,
          vehicle_id: order.vehicle_id,
          vehicle_category: {
            tag: category.tag,
            name: category.name,
            icon: category.icon,
          },
          address: order.address,
          scheduled_date: order.scheduled_date,
          status: order.status,
          price: order.price,
          client_notes: order.client_notes,
          created_at: order.created_at,
          washer: {
            id: washer.id,
            name: washer.users ? `${washer.users.first_name} ${washer.users.last_name}` : 'Unknown',
            rating: washer.rating,
            total_jobs: washer.total_jobs,
          },
        },
        price_breakdown: {
          base: adjustedBase,
          sales_tax: salesTax,
          platform_fee: platformFee,
          total: total,
        },
        vehicle_info: {
          category: category.name,
          length: vehicleLength,
          weight: vehicleWeight,
          estimated_time: estimatedDuration,
          required_spaces: category.required_spaces,
        },
        estimated_response_seconds: 45,
        cancellation_hours: 2,
        created_at: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Create order error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function authenticate(req: Request) {
  const { token, error: tokenError } = extractToken(req);
  if (tokenError) {
    return { error: 'Unauthorized - ' + tokenError };
  }

  const decoded = decodeJWT(token!);
  if (!decoded.success) {
    return { error: 'Unauthorized - Invalid token' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (decoded.payload.exp && decoded.payload.exp < now) {
    return { error: 'Unauthorized - Token expired' };
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  );

  const userId = decoded.payload.userId || decoded.payload.sub;
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .eq('is_active', true)
    .single();

  if (userError || !user) {
    return { error: 'Unauthorized - User not found' };
  }

  return { user, payload: decoded.payload };
}