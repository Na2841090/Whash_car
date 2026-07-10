// supabase/functions/vehicle-classification/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { decodeJWT, extractToken, corsHeaders } from '../_shared/auth.ts';

// ============================================
// FUNÇÃO DE CLASSIFICAÇÃO
// ============================================
function classifyVehicle(
  comprimento: number,
  peso: number,
  classifications: any[]
): any {
  // 1. Filtrar por comprimento (com tolerância de sobreposição)
  const candidates = classifications.filter(c => {
    const min = c.comprimento_min - 0.05;
    const max = c.comprimento_max + 0.05;
    return comprimento >= min && comprimento <= max;
  });

  if (candidates.length === 0) {
    return {
      error: 'Nenhuma classificação encontrada para as dimensões informadas',
      comprimento,
      peso,
    };
  }

  // 2. Se houver múltiplos, refinar por peso
  if (candidates.length > 1) {
    // Buscar o mais próximo em peso
    const sorted = candidates.sort((a, b) => {
      const diffA = Math.abs(a.peso_min - peso);
      const diffB = Math.abs(b.peso_min - peso);
      return diffA - diffB;
    });

    // Se a diferença for pequena (<100kg), usar prioridade
    if (Math.abs(sorted[0].peso_min - sorted[1]?.peso_min) < 100) {
      return sorted[0];
    }

    return sorted[0];
  }

  return candidates[0];
}

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

    console.log(`📝 Vehicle-Classification request: ${req.method} ${path}`);

    // 🔥 ROTA: classify (pública - classificador de veículos)
    if (path === 'classify' && req.method === 'POST') {
      return await handleClassify(req);
    }

    // 🔥 ROTA: list (pública - lista todas as classificações)
    if (path === 'list' && req.method === 'GET') {
      return await handleList(req);
    }

    // 🔥 ROTA: health (pública)
    if (path === 'health' || path === '') {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Vehicle Classification service is running! 🚗',
          timestamp: new Date().toISOString(),
          endpoints: {
            'POST /classify': 'Classificar um veículo por comprimento e peso',
            'GET /list': 'Listar todas as classificações',
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
        error: 'Rota não encontrada',
        available: {
          'POST /classify': 'Classificar veículo',
          'GET /list': 'Listar classificações',
        },
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Vehicle-Classification error:', error);
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
// HANDLER: CLASSIFICAR VEÍCULO
// ============================================
async function handleClassify(req: Request) {
  try {
    const body = await req.json();
    const { comprimento, peso, modelo, marca } = body;

    if (!comprimento || !peso) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: comprimento (m), peso (kg)',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Buscar todas as classificações
    const { data: classifications, error } = await supabase
      .from('vehicle_classification')
      .select('*')
      .order('prioridade');

    if (error) {
      console.error('Error fetching classifications:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to fetch classifications',
          details: error.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Classificar o veículo
    const result = classifyVehicle(comprimento, peso, classifications);

    if (result.error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: result.error,
          input: { comprimento, peso },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calcular preço sugerido
    const precoBase = result.preco_base;
    const tempoEstimado = result.tempo_medio_lavagem_min;

    // Determinar multiplicador por tipo
    const multiplicadores = {
      AUTOMOVEL: { min: 1.0, max: 2.0 },
      UTILITARIO: { min: 1.5, max: 2.5 },
      CAMINHAO: { min: 3.0, max: 10.0 },
      ESPECIAL: { min: 8.0, max: 20.0 },
    };

    const mult = multiplicadores[result.tipo as keyof typeof multiplicadores] || { min: 1.0, max: 2.0 };

    return new Response(
      JSON.stringify({
        success: true,
        classification: {
          id: result.id,
          tag: result.tag,
          classification: result.classification,
          tipo: result.tipo,
        },
        vehicle: {
          comprimento,
          peso,
          modelo: modelo || 'Não informado',
          marca: marca || 'Não informada',
        },
        pricing: {
          preco_base: precoBase,
          preco_sugerido: precoBase,
          faixa_preco: {
            min: Math.round(precoBase * mult.min * 100) / 100,
            max: Math.round(precoBase * mult.max * 100) / 100,
          },
        },
        logistics: {
          tempo_estimado_lavagem: `${tempoEstimado} minutos`,
          vagas_necessarias: result.vagas_necessarias,
          altura_minima_vaga: `${result.altura_minima_vaga}m`,
        },
        alert: result.alerta || null,
        examples: result.exemplos || [],
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Classify error:', error);
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
// HANDLER: LISTAR CLASSIFICAÇÕES
// ============================================
async function handleList(req: Request) {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { data, error } = await supabase
      .from('vehicle_classification')
      .select('*')
      .order('prioridade');

    if (error) {
      console.error('Error fetching classifications:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to fetch classifications',
          details: error.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        classifications: data || [],
        total: data?.length || 0,
        versao: '1.0.0',
        data_atualizacao: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ List error:', error);
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