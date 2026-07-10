// supabase/functions/create-payment-intent/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createSupabaseClient, getAuthenticatedUser } from '../_shared/supabase.ts';
import { corsHeaders } from '../_shared/constants.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = await getAuthenticatedUser(authHeader);
    const supabase = createSupabaseClient(authHeader);

    const { orderId, customerId, amount, currency = 'USD' } = await req.json();

    if (!orderId || !amount) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Missing required fields: orderId, amount' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Verificar se o pedido existe e pertence ao usuário
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, address(state)')
      .eq('id', orderId)
      .eq('client_id', user.id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Order not found' 
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Criar Payment Intent no Stripe
    const stripeIntent = await createStripePaymentIntent({
      amount: Math.round(amount * 100), // em centavos
      currency: currency.toLowerCase(),
      customerId: customerId || null,
      metadata: {
        orderId: order.id,
        userId: user.id,
        state: order.address?.state || 'unknown',
      },
    });

    if (!stripeIntent.success) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: stripeIntent.error || 'Failed to create payment intent' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Salvar payment intent no banco
    await supabase
      .from('payment_intents')
      .insert({
        id: stripeIntent.id,
        order_id: orderId,
        user_id: user.id,
        amount: amount,
        currency: currency,
        client_secret: stripeIntent.client_secret,
        status: stripeIntent.status,
        metadata: stripeIntent.metadata,
        created_at: new Date().toISOString(),
      });

    // Registrar log
    await supabase
      .from('audit_logs')
      .insert({
        user_id: user.id,
        action: 'create_payment_intent',
        details: { 
          order_id: orderId, 
          payment_intent_id: stripeIntent.id,
          amount: amount,
        },
        timestamp: new Date().toISOString(),
      });

    return new Response(
      JSON.stringify({
        success: true,
        payment_intent: {
          id: stripeIntent.id,
          client_secret: stripeIntent.client_secret,
          amount: amount,
          currency: currency,
          status: stripeIntent.status,
        },
        publishable_key: Deno.env.get('STRIPE_PUBLISHABLE_KEY'),
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Payment intent error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Failed to create payment intent',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Helper: Criar Payment Intent no Stripe
async function createStripePaymentIntent(params: any) {
  try {
    // Simular criação no Stripe
    return {
      success: true,
      id: `pi_${crypto.randomUUID()}`,
      client_secret: `pi_${crypto.randomUUID()}_secret_${crypto.randomUUID()}`,
      status: 'requires_payment_method',
      amount: params.amount,
      currency: params.currency,
      metadata: params.metadata,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}