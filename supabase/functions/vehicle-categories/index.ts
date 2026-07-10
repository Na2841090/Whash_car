// supabase/functions/vehicle-categories/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/auth.ts';

// ============================================
// CONSTANTES
// ============================================
const DEFAULT_ICONS: Record<string, string> = {
  'ULTRA_COMPACT': '🚗',
  'CITY': '🚗',
  'SUB_COMPACT': '🚗',
  'CROSSOVER': '🚙',
  'MIDSIZE': '🚗',
  'SUV_MIDSIZE': '🚙',
  'EXEC_ENTRY': '🚗',
  'SUV_LARGE': '🚙',
  'EXEC_LUXO': '🏎️',
  'LUXURY': '🏎️',
  'PICKUP': '🛻',
  'FULL_SIZE': '🛻',
  'TRUCK_LIGHT': '🚚',
  'TRUCK_MID': '🚚',
  'TRUCK_HEAVY': '🚛',
  'TRACTOR': '🚛',
  'DOUBLE_TRAILER': '🚛',
  'BUS': '🚌',
  'UNKNOWN': '❓',
};

const DEFAULT_IMAGES: Record<string, string> = {
  'SEDAN': '/images/categories/sedan.svg',
  'SUV': '/images/categories/suv.svg',
  'PICKUP': '/images/categories/pickup.svg',
  'VAN': '/images/categories/van.svg',
  'TRUCK': '/images/categories/truck.svg',
  'BUS': '/images/categories/bus.svg',
  'SPORTS': '/images/categories/sports.svg',
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

    console.log(`📝 Vehicle-Categories request: ${req.method} ${path}`);

    // 🔥 ROTA: list - Listar todas as categorias
    if (path === 'list' && req.method === 'GET') {
      return await handleListCategories(req);
    }

    // 🔥 ROTA: get - Buscar categoria por slug
    if (path === 'get' && req.method === 'GET') {
      const slug = url.searchParams.get('slug');
      if (slug) {
        return await handleGetCategory(req, slug);
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing parameter: slug',
          hint: 'Try: /get?slug=sedan',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 ROTA: health
    if (path === 'health' || path === '') {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Vehicle Categories service is running! 🚗',
          timestamp: new Date().toISOString(),
          endpoints: {
            'GET /list': 'Listar todas as categorias',
            'GET /get?slug=sedan': 'Buscar categoria por slug',
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
          'GET /list': 'Listar categorias',
          'GET /get?slug=sedan': 'Buscar categoria',
        },
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Vehicle-Categories error:', error);
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
// HANDLER: LISTAR CATEGORIAS
// ============================================
async function handleListCategories(req: Request) {
  try {
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get('include_inactive') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    let query = supabase
      .from('vehicle_classification')
      .select('*')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('prioridade', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data: categories, error } = await query
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching categories:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to fetch categories',
          details: error.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Formatar para o frontend
    const formatted = categories?.map((cat: any) => ({
      id: cat.id,
      name: cat.name || cat.classification,
      slug: cat.slug || cat.tag.toLowerCase().replace(/_/g, '-'),
      tag: cat.tag,
      icon: cat.icon || DEFAULT_ICONS[cat.tag] || '🚗',
      image_url: cat.image_url || DEFAULT_IMAGES[cat.tag] || '/images/categories/default.svg',
      description: cat.description || cat.classification,
      classification: cat.classification,
      // Dimensões
      dimensions: {
        min: {
          comprimento: cat.comprimento_min,
          peso: cat.peso_min,
        },
        max: {
          comprimento: cat.comprimento_max,
          peso: cat.peso_max,
        },
        medio: {
          comprimento: cat.comprimento_medio,
          peso: cat.peso_medio,
          altura: cat.altura_media,
          largura: cat.largura_media,
        },
      },
      // Preço e logística
      pricing: {
        base: cat.preco_base,
        multiplier: {
          min: cat.multiplicador_minimo || 1.0,
          max: cat.multiplicador_maximo || 2.0,
        },
      },
      logistics: {
        tempo_medio: cat.tempo_medio_lavagem_min,
        vagas_necessarias: cat.vagas_necessarias,
        altura_minima: cat.altura_minima_vaga,
      },
      tipo: cat.tipo,
      exemplos: cat.exemplos || [],
      alerta: cat.alerta || null,
      prioridade: cat.prioridade,
      is_active: cat.is_active,
      display_order: cat.display_order,
    })) || [];

    // Buscar total
    let countQuery = supabase
      .from('vehicle_classification')
      .select('*', { count: 'exact', head: true });

    if (!includeInactive) {
      countQuery = countQuery.eq('is_active', true);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error('Error counting categories:', countError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        categories: formatted,
        pagination: {
          limit,
          offset,
          total: count || 0,
        },
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ List categories error:', error);
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
// HANDLER: BUSCAR CATEGORIA POR SLUG
// ============================================
async function handleGetCategory(req: Request, slug: string) {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { data: category, error } = await supabase
      .from('vehicle_classification')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error || !category) {
      // Tentar buscar por tag se não encontrar por slug
      const { data: categoryByTag, error: tagError } = await supabase
        .from('vehicle_classification')
        .select('*')
        .eq('tag', slug.toUpperCase().replace(/-/g, '_'))
        .eq('is_active', true)
        .single();

      if (tagError || !categoryByTag) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Category not found',
            slug: slug,
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          category: formatCategory(categoryByTag),
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        category: formatCategory(category),
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Get category error:', error);
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
// FUNÇÃO AUXILIAR: FORMATAR CATEGORIA
// ============================================
function formatCategory(cat: any) {
  return {
    id: cat.id,
    name: cat.name || cat.classification,
    slug: cat.slug || cat.tag.toLowerCase().replace(/_/g, '-'),
    tag: cat.tag,
    icon: cat.icon || DEFAULT_ICONS[cat.tag] || '🚗',
    image_url: cat.image_url || DEFAULT_IMAGES[cat.tag] || '/images/categories/default.svg',
    description: cat.description || cat.classification,
    classification: cat.classification,
    dimensions: {
      min: {
        comprimento: cat.comprimento_min,
        peso: cat.peso_min,
      },
      max: {
        comprimento: cat.comprimento_max,
        peso: cat.peso_max,
      },
      medio: {
        comprimento: cat.comprimento_medio,
        peso: cat.peso_medio,
        altura: cat.altura_media,
        largura: cat.largura_media,
      },
    },
    pricing: {
      base: cat.preco_base,
      multiplier: {
        min: cat.multiplicador_minimo || 1.0,
        max: cat.multiplicador_maximo || 2.0,
      },
    },
    logistics: {
      tempo_medio: cat.tempo_medio_lavagem_min,
      vagas_necessarias: cat.vagas_necessarias,
      altura_minima: cat.altura_minima_vaga,
    },
    tipo: cat.tipo,
    exemplos: cat.exemplos || [],
    alerta: cat.alerta || null,
    prioridade: cat.prioridade,
  };
}

// ============================================
// FUNÇÃO AUXILIAR: VALIDAR VEÍCULO POR CATEGORIA
// ============================================
export function validateVehicleByCategory(
  category: any,
  comprimento: number,
  peso: number
): { valid: boolean; message?: string } {
  if (!category) {
    return { valid: false, message: 'Categoria não encontrada' };
  }

  const minLen = category.comprimento_min || 0;
  const maxLen = category.comprimento_max || Infinity;
  const minWeight = category.peso_min || 0;
  const maxWeight = category.peso_max || Infinity;

  if (comprimento < minLen || comprimento > maxLen) {
    return {
      valid: false,
      message: `Comprimento fora da faixa para ${category.name}. Faixa: ${minLen}m - ${maxLen}m`,
    };
  }

  if (peso < minWeight || peso > maxWeight) {
    return {
      valid: false,
      message: `Peso fora da faixa para ${category.name}. Faixa: ${minWeight}kg - ${maxWeight}kg`,
    };
  }

  return { valid: true };
}