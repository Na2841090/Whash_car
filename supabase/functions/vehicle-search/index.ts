// supabase/functions/vehicle-categories/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/auth.ts';

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
            'GET /list': 'Listar todas as categorias com imagens',
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    let query = supabase
      .from('vehicle_categories')
      .select('*, vehicle_classification(*)')
      .order('display_order');

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data: categories, error } = await query;

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
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon || getIconForCategory(cat.slug),
      image_url: cat.image_url || getImageForCategory(cat.slug),
      description: cat.description,
      dimensions: {
        comprimento: cat.comprimento_medio,
        peso: cat.peso_medio,
        altura: cat.altura_media,
        largura: cat.largura_media,
      },
      classification: cat.vehicle_classification ? {
        id: cat.vehicle_classification.id,
        tag: cat.vehicle_classification.tag,
        preco_base: cat.vehicle_classification.preco_base,
      } : null,
      vagas_necessarias: cat.vagas_necessarias,
      is_active: cat.is_active,
      display_order: cat.display_order,
    })) || [];

    return new Response(
      JSON.stringify({
        success: true,
        categories: formatted,
        total: formatted.length,
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
      .from('vehicle_categories')
      .select('*, vehicle_classification(*)')
      .eq('slug', slug)
      .single();

    if (error || !category) {
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
        category: {
          id: category.id,
          name: category.name,
          slug: category.slug,
          icon: category.icon || getIconForCategory(category.slug),
          image_url: category.image_url || getImageForCategory(category.slug),
          description: category.description,
          dimensions: {
            comprimento: category.comprimento_medio,
            peso: category.peso_medio,
            altura: category.altura_media,
            largura: category.largura_media,
          },
          classification: category.vehicle_classification ? {
            id: category.vehicle_classification.id,
            tag: category.vehicle_classification.tag,
            preco_base: category.vehicle_classification.preco_base,
          } : null,
          vagas_necessarias: category.vagas_necessarias,
        },
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
// FUNÇÕES AUXILIARES (ÍCONES E IMAGENS)
// ============================================

function getIconForCategory(slug: string): string {
  const icons: Record<string, string> = {
    'sedan': '🚗',
    'suv': '🚙',
    'hatch': '🚗',
    'pickup': '🛻',
    'van': '🚐',
    'light-truck': '🚚',
    'heavy-truck': '🚛',
    'sports': '🏎️',
    'tractor': '🚛',
    'bus': '🚌',
    'unknown': '❓',
  };
  return icons[slug] || '🚗';
}

function getImageForCategory(slug: string): string {
  // URLs das imagens (pode usar SVG ou PNG)
  const images: Record<string, string> = {
    'sedan': 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f697.png',
    'suv': 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f699.png',
    'hatch': 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f697.png',
    'pickup': 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f6fb.png',
    'van': 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f690.png',
    'sports': 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3ce.png',
    'bus': 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f68c.png',
  };
  return images[slug] || images['sedan'];
}