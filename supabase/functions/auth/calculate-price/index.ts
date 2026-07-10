// supabase/functions/calculate-price/index.ts (versão otimizada)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Cache simples em memória
const priceCache = new Map();

Deno.serve(async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  try {
    const { service_id, extras_ids, pickup_address, delivery_address } = await req.json();
    
    // Cache key
    const cacheKey = `${service_id}-${extras_ids.sort().join(',')}-${pickup_address === delivery_address}`;
    
    // Verificar cache (TTL 60 segundos)
    if (priceCache.has(cacheKey)) {
      const cached = priceCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 60000) {
        return new Response(JSON.stringify(cached.data), { headers });
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    // Parallel queries para melhor performance
    const [serviceResult, extrasResult] = await Promise.all([
      supabase.from('services').select('base_price, name_en, name_es').eq('id', service_id).single(),
      extras_ids?.length ? supabase.from('extra_services').select('id, name_en, name_es, price').in('id', extras_ids) : { data: [] }
    ]);

    const service = serviceResult.data;
    const extras = extrasResult.data || [];
    
    const extrasTotal = extras.reduce((sum, e) => sum + e.price, 0);
    const deliveryFee = pickup_address === delivery_address ? 0 : 9.99;
    const total = (service?.base_price || 0) + extrasTotal + deliveryFee;

    const response = {
      success: true,
      total: total.toFixed(2),
      subtotal: (service?.base_price || 0 + extrasTotal).toFixed(2),
      currency: 'usd',
      breakdown: {
        base_service: {
          id: service_id,
          name: service?.name_en,
          price: service?.base_price
        },
        extras: extras,
        delivery_fee: deliveryFee
      },
      cached: false
    };

    // Salvar no cache
    priceCache.set(cacheKey, { data: response, timestamp: Date.now() });

    return new Response(JSON.stringify(response), { headers });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers }
    );
  }
});