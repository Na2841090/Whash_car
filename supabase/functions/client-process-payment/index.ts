// supabase/functions/client-process-payment/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createSupabaseClient, getAuthenticatedUser } from '../_shared/supabase.ts';
import { corsHeaders, TIP_SUGGESTIONS } from '../_shared/constants.ts';

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

    const { 
      orderId, 
      paymentMethod, 
      tipPercentage,
      saveCard 
    } = await req.json();

    // Validar entrada
    if (!orderId || !paymentMethod) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Missing required fields: orderId, paymentMethod' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // 1. Buscar pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, address')
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

    // 2. Calcular valor total
    const baseAmount = order.price.total;
    const tipAmount = tipPercentage ? Math.round(baseAmount * tipPercentage * 100) / 100 : 0;
    const totalAmount = Math.round((baseAmount + tipAmount) * 100) / 100;

    // 3. Verificar 3D Secure para valores > $100
    let threeDSResult = null;
    if (totalAmount > 100) {
      threeDSResult = await init3DSecure(order);
      if (threeDSResult.status === 'pending') {
        return new Response(
          JSON.stringify({
            success: false,
            status: 'requires_authentication',
            threeDS: threeDSResult,
            message: 'Additional authentication required',
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    }

    // 4. Processar pagamento com Stripe
    const payment = await processStripePayment({
      amount: totalAmount,
      currency: 'USD',
      paymentMethod,
      metadata: {
        orderId: order.id,
        clientId: user.id,
        state: order.address.state,
        service: order.service_type,
      },
    });

    if (!payment.success) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: payment.error || 'Payment failed' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // 5. Salvar transação
    const { data: transaction, error: txError } = await supabase
      .from('payments')
      .insert({
        order_id: order.id,
        user_id: user.id,
        amount: totalAmount,
        currency: 'USD',
        method: paymentMethod,
        status: payment.status,
        transaction_id: payment.id,
        tip_amount: tipAmount,
        tip_percentage: tipPercentage || 0,
        metadata: {
          state: order.address.state,
          sales_tax: order.price.state_tax,
          platform_fee: order.price.platform_fee,
          base_amount: baseAmount,
        },
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (txError) {
      console.error('Error saving payment:', txError);
    }

    // 6. Atualizar status do pedido
    await supabase
      .from('orders')
      .update({ 
        status: 'COMPLETED',
        paid_at: new Date().toISOString(),
        tip_amount: tipAmount,
      })
      .eq('id', order.id);

    // 7. Gerar invoice
    const invoice = await generateInvoice(order, payment, tipAmount);

    // 8. Registrar log
    await supabase
      .from('audit_logs')
      .insert({
        user_id: user.id,
        action: 'process_payment',
        details: { 
          order_id: order.id, 
          payment_id: payment.id,
          amount: totalAmount,
        },
        timestamp: new Date().toISOString(),
      });

    // 9. Retornar sucesso
    return new Response(
      JSON.stringify({
        success: true,
        payment: {
          id: payment.id,
          status: payment.status,
          amount: totalAmount,
          tip: tipAmount,
          tip_percentage: tipPercentage || 0,
          method: paymentMethod,
        },
        invoice: invoice,
        receipt_url: `https://wash.com/receipts/${payment.id}`,
        tip_suggestions: TIP_SUGGESTIONS.map(p => ({
          percentage: p * 100,
          amount: Math.round(baseAmount * p * 100) / 100,
        })),
        message: 'Payment processed successfully',
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Payment error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Payment processing failed',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Helper: 3D Secure
async function init3DSecure(order: any) {
  return {
    status: 'pending',
    authentication_url: 'https://bank.com/auth',
    session_id: crypto.randomUUID(),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

// Helper: Processar Stripe
async function processStripePayment(params: any) {
  try {
    // Simular chamada Stripe
    return {
      success: true,
      id: `pi_${crypto.randomUUID()}`,
      status: 'succeeded',
      amount: params.amount,
      currency: params.currency,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// Helper: Gerar invoice
async function generateInvoice(order: any, payment: any, tip: number) {
  return {
    invoice_number: `INV-${Date.now()}`,
    order_id: order.id,
    client_id: order.client_id,
    washer_id: order.washer_id,
    service: order.service_type,
    address: order.address,
    items: [{
      description: order.service_type.replace('-', ' ').toUpperCase(),
      quantity: 1,
      unit_price: order.price.base,
      total: order.price.base,
    }],
    subtotal: order.price.base,
    sales_tax: order.price.state_tax,
    platform_fee: order.price.platform_fee,
    tip: tip,
    total: payment.amount,
    payment_method: payment.method,
    paid_at: new Date().toISOString(),
    status: 'paid',
  };
}