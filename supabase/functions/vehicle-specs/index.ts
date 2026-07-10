// supabase/functions/vehicle-specs/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// 📦 CACHE EM MEMÓRIA
const cache = new Map<string, { data: any, timestamp: number }>()
const CACHE_TTL = 3600000 // 1 hora

// 🔑 Configuração da API Ninjas
const API_NINJAS_URL = 'https://api.api-ninjas.com/v1/cars'
const API_NINJAS_KEY = Deno.env.get('56XR7cGE5Y0P5133s1fy3yUJKDaZvgmNCZDiWnox') || ''

// 🧠 FUNÇÃO PARA BUSCAR DA API NINJAS
async function fetchFromApiNinjas(marca: string, modelo: string) {
  console.log(`🌐 Buscando da API Ninjas: ${marca} ${modelo}`)
  
  if (!API_NINJAS_KEY) {
    console.log('⚠️ API_NINJAS_KEY não configurada')
    return null
  }

  try {
    // Construir URL com parâmetros
    const params = new URLSearchParams()
    if (marca) params.append('make', marca)
    if (modelo) params.append('model', modelo)
    
    const url = `${API_NINJAS_URL}?${params.toString()}`
    console.log(`📡 URL: ${url}`)
    
    const response = await fetch(url, {
      headers: {
        'X-Api-Key': API_NINJAS_KEY
      }
    })

    if (!response.ok) {
      console.log(`❌ API Ninjas erro: ${response.status}`)
      return null
    }

    const data = await response.json()
    console.log(`📥 API Ninjas retornou ${data.length} resultados`)
    
    if (!data || data.length === 0) {
      return null
    }

    // Pegar o primeiro resultado mais relevante
    let vehicle = data[0]
    
    // Se tem muitos resultados, tentar encontrar o melhor match
    if (data.length > 1 && modelo) {
      const modeloLower = modelo.toLowerCase()
      const betterMatch = data.find((v: any) => 
        v.model?.toLowerCase().includes(modeloLower) ||
        modeloLower.includes(v.model?.toLowerCase())
      )
      if (betterMatch) {
        vehicle = betterMatch
      }
    }

    console.log(`✅ Veículo encontrado: ${vehicle.make} ${vehicle.model}`)

    // Converter unidades (imperial para métricas)
    const lengthInMeters = vehicle.length ? vehicle.length * 0.3048 : 0
    const widthInMeters = vehicle.width ? vehicle.width * 0.3048 : 0
    const heightInMeters = vehicle.height ? vehicle.height * 0.3048 : 0
    const weightInKg = vehicle.weight ? vehicle.weight * 0.453592 : 0

    // Mapear categoria
    let categoria = 'Sedan'
    if (vehicle.class) {
      const classLower = vehicle.class.toLowerCase()
      if (classLower.includes('suv') || classLower.includes('crossover')) categoria = 'SUV'
      else if (classLower.includes('pickup') || classLower.includes('truck')) categoria = 'Picape'
      else if (classLower.includes('sport') || classLower.includes('performance')) categoria = 'Esportivo'
      else if (classLower.includes('hatchback')) categoria = 'Hatch'
      else if (classLower.includes('sedan')) categoria = 'Sedan'
    }

    // Mapear combustível
    let combustivel = 'N/A'
    if (vehicle.fuel_type) {
      const fuelLower = vehicle.fuel_type.toLowerCase()
      if (fuelLower.includes('gasoline') || fuelLower.includes('petrol')) combustivel = 'Gasolina'
      else if (fuelLower.includes('diesel')) combustivel = 'Diesel'
      else if (fuelLower.includes('hybrid')) combustivel = 'Híbrido'
      else if (fuelLower.includes('electric')) combustivel = 'Elétrico'
      else if (fuelLower.includes('flex')) combustivel = 'Flex'
    }

    return {
      comprimento: parseFloat(lengthInMeters.toFixed(2)),
      peso: parseFloat(weightInKg.toFixed(0)),
      modelo: vehicle.model || modelo,
      marca: vehicle.make || marca,
      altura: parseFloat(heightInMeters.toFixed(2)),
      largura: parseFloat(widthInMeters.toFixed(2)),
      motor: vehicle.engine || 'N/A',
      potencia: vehicle.horsepower || 0,
      consumo: vehicle.city_mpg || 0,
      ano: vehicle.year || 2023,
      categoria: categoria,
      combustivel: combustivel,
      tracao: vehicle.drivetrain || 'N/A',
      portas: vehicle.doors || 4,
      lugares: vehicle.seats || 5,
      transmissao: vehicle.transmission || 'N/A',
      cilindros: vehicle.cylinders || 0,
      fonte: 'API Ninjas',
      api_data: vehicle // Dados brutos da API para debug
    }

  } catch (error) {
    console.log('❌ Erro na API Ninjas:', error.message)
    return null
  }
}

// 📊 FALLBACK: Dados estáticos para marcas/modelos conhecidos
function getFallbackData(marca: string, modelo: string) {
  const marcaLower = marca.toLowerCase().trim()
  const modeloLower = modelo.toLowerCase().trim()
  
  // Dados de veículos populares (fallback caso API falhe)
  const fallbackDatabase: { [key: string]: any } = {
    'ford|f-150': {
      comprimento: 5.88, peso: 2650, modelo: 'F-150', marca: 'Ford',
      altura: 1.99, largura: 2.19, motor: '3.5 V6 EcoBoost',
      potencia: 450, consumo: 7.8, ano: 2023,
      categoria: 'Picape', combustivel: 'Gasolina',
      tracao: '4x4', portas: 4, lugares: 5
    },
    'ford|mustang': {
      comprimento: 4.79, peso: 1740, modelo: 'Mustang', marca: 'Ford',
      altura: 1.38, largura: 1.92, motor: '5.0 V8',
      potencia: 450, consumo: 10.2, ano: 2023,
      categoria: 'Esportivo', combustivel: 'Gasolina',
      tracao: 'Traseira', portas: 2, lugares: 4
    },
    'chevrolet|silverado': {
      comprimento: 5.84, peso: 2580, modelo: 'Silverado', marca: 'Chevrolet',
      altura: 1.94, largura: 2.06, motor: '6.2 V8',
      potencia: 420, consumo: 8.5, ano: 2023,
      categoria: 'Picape', combustivel: 'Gasolina',
      tracao: '4x4', portas: 4, lugares: 6
    },
    'toyota|hilux': {
      comprimento: 5.33, peso: 2100, modelo: 'Hilux', marca: 'Toyota',
      altura: 1.86, largura: 1.86, motor: '2.8 Diesel',
      potencia: 204, consumo: 8.0, ano: 2023,
      categoria: 'Picape', combustivel: 'Diesel',
      tracao: '4x4', portas: 4, lugares: 5
    },
    'toyota|corolla': {
      comprimento: 4.63, peso: 1340, modelo: 'Corolla', marca: 'Toyota',
      altura: 1.45, largura: 1.78, motor: '2.0',
      potencia: 169, consumo: 6.0, ano: 2023,
      categoria: 'Sedan', combustivel: 'Flex',
      tracao: 'Dianteira', portas: 4, lugares: 5
    },
    'volkswagen|amarok': {
      comprimento: 5.25, peso: 2200, modelo: 'Amarok', marca: 'Volkswagen',
      altura: 1.83, largura: 1.94, motor: '3.0 V6 Diesel',
      potencia: 272, consumo: 8.2, ano: 2023,
      categoria: 'Picape', combustivel: 'Diesel',
      tracao: '4x4', portas: 4, lugares: 5
    },
    'fiat|toro': {
      comprimento: 4.92, peso: 1700, modelo: 'Toro', marca: 'Fiat',
      altura: 1.72, largura: 1.86, motor: '2.0 Turbo Diesel',
      potencia: 170, consumo: 7.5, ano: 2023,
      categoria: 'Picape', combustivel: 'Diesel',
      tracao: '4x4', portas: 4, lugares: 5
    },
    'porsche|911': {
      comprimento: 4.52, peso: 1500, modelo: '911 Carrera', marca: 'Porsche',
      altura: 1.30, largura: 1.85, motor: '3.0 Boxer',
      potencia: 385, consumo: 8.0, ano: 2023,
      categoria: 'Esportivo', combustivel: 'Gasolina',
      tracao: 'Traseira', portas: 2, lugares: 4
    },
    'honda|civic': {
      comprimento: 4.68, peso: 1400, modelo: 'Civic', marca: 'Honda',
      altura: 1.42, largura: 1.80, motor: '1.5 Turbo',
      potencia: 173, consumo: 6.2, ano: 2023,
      categoria: 'Sedan', combustivel: 'Gasolina',
      tracao: 'Dianteira', portas: 4, lugares: 5
    }
  }

  // Buscar match exato
  const exactKey = Object.keys(fallbackDatabase).find(key => {
    const [m, mod] = key.split('|')
    return (m === marcaLower || marcaLower.includes(m)) &&
           (mod === modeloLower || modeloLower.includes(mod))
  })

  if (exactKey) {
    return {
      ...fallbackDatabase[exactKey],
      fonte: 'Base de dados estática (fallback)'
    }
  }

  // Buscar por marca apenas
  const brandMatch = Object.keys(fallbackDatabase).find(key => {
    const [m] = key.split('|')
    return m === marcaLower || marcaLower.includes(m)
  })

  if (brandMatch) {
    return {
      ...fallbackDatabase[brandMatch],
      modelo: modelo || fallbackDatabase[brandMatch].modelo,
      fonte: 'Base de dados estática (fallback)'
    }
  }

  return null
}

// 🔍 FUNÇÃO PARA BUSCAR DADOS (API Ninjas + Fallback)
async function fetchVehicleData(marca: string, modelo: string) {
  console.log(`🔍 Buscando: ${marca} ${modelo}`)
  
  const cacheKey = `${marca.toLowerCase()}|${modelo.toLowerCase()}`
  
  // 1. Verificar cache
  const cached = cache.get(cacheKey)
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    console.log('✅ Dados do cache')
    return cached.data
  }

  // 2. Buscar da API Ninjas
  let vehicleData = await fetchFromApiNinjas(marca, modelo)
  
  if (vehicleData) {
    console.log('✅ Dados da API Ninjas')
    cache.set(cacheKey, { data: vehicleData, timestamp: Date.now() })
    return vehicleData
  }

  // 3. Fallback para dados estáticos
  const fallbackData = getFallbackData(marca, modelo)
  if (fallbackData) {
    console.log('✅ Dados do fallback')
    cache.set(cacheKey, { data: fallbackData, timestamp: Date.now() })
    return fallbackData
  }

  return null
}

// 🧠 EXTRAIR INFORMAÇÕES
function extractVehicleInfo(input: any): { marca: string, modelo: string } | null {
  console.log('📥 Input:', JSON.stringify(input))
  
  if (input.marca && input.modelo) {
    return {
      marca: String(input.marca).trim(),
      modelo: String(input.modelo).trim()
    }
  }
  
  const keys = Object.keys(input)
  const marcaKey = keys.find(k => 
    k.toLowerCase().includes('marca') || 
    k.toLowerCase().includes('brand') ||
    k.toLowerCase().includes('make')
  )
  
  const modeloKey = keys.find(k =>
    k.toLowerCase().includes('modelo') ||
    k.toLowerCase().includes('model') ||
    k.toLowerCase().includes('vehicle')
  )
  
  if (marcaKey && modeloKey) {
    return {
      marca: String(input[marcaKey]).trim(),
      modelo: String(input[modeloKey]).trim()
    }
  }
  
  if (typeof input === 'string') {
    const parts = input.split(/\s{2,}|[-,;]\s*/).filter(p => p.trim())
    if (parts.length >= 2) {
      return {
        marca: parts[0].trim(),
        modelo: parts.slice(1).join(' ').trim()
      }
    }
  }
  
  if (Array.isArray(input) && input.length >= 2) {
    return {
      marca: String(input[0]).trim(),
      modelo: String(input[1]).trim()
    }
  }
  
  return null
}

// 💡 GERAR SUGESTÕES
function getSuggestions(marca: string, modelo: string) {
  const sugestoes: string[] = []
  const marcaLower = marca.toLowerCase().trim()
  
  const marcasPopulares = ['Ford', 'Chevrolet', 'Toyota', 'Volkswagen', 'Fiat', 'Porsche', 'Honda', 'Hyundai']
  const similares = marcasPopulares.filter(m => 
    m.toLowerCase().includes(marcaLower) || 
    marcaLower.includes(m.toLowerCase())
  )
  
  if (similares.length > 0) {
    sugestoes.push(`💡 Você quis dizer: ${similares[0]}?`)
  }
  
  sugestoes.push(
    'Ford F-150',
    'Ford Mustang',
    'Chevrolet Silverado',
    'Toyota Hilux',
    'Volkswagen Amarok'
  )
  
  return sugestoes.slice(0, 6)
}

// 🎯 FUNÇÃO PRINCIPAL
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let input: any
    
    if (req.method === 'POST') {
      try {
        input = await req.json()
      } catch {
        input = await req.text()
      }
    } else if (req.method === 'GET') {
      const url = new URL(req.url)
      const marca = url.searchParams.get('marca')
      const modelo = url.searchParams.get('modelo')
      
      if (marca && modelo) {
        input = { marca, modelo }
      } else {
        const query = url.searchParams.get('q') || url.searchParams.get('query')
        if (query) {
          input = query
        } else {
          return new Response(
            JSON.stringify({
              error: 'Use ?marca=XX&modelo=YY ou ?q=ford%20f-150'
            }),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
      }
    } else {
      return new Response(
        JSON.stringify({ error: 'Use GET ou POST' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    const extracted = extractVehicleInfo(input)
    
    if (!extracted || !extracted.marca) {
      return new Response(
        JSON.stringify({
          error: 'Não foi possível identificar marca e modelo',
          dica: 'Envie algo como: { "marca": "Ford", "modelo": "F-150" }'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    // 🌐 BUSCAR DADOS
    const vehicleData = await fetchVehicleData(extracted.marca, extracted.modelo)
    
    if (!vehicleData) {
      const sugestoes = getSuggestions(extracted.marca, extracted.modelo)
      
      return new Response(
        JSON.stringify({
          error: 'Veículo não encontrado',
          busca: {
            marca: extracted.marca,
            modelo: extracted.modelo || '(não especificado)'
          },
          sugestoes: sugestoes,
          dica: 'Tente usar o nome completo da marca e modelo'
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    // ✅ RESPOSTA
    const response = {
      comprimento: vehicleData.comprimento || 0,
      peso: vehicleData.peso || 0,
      modelo: vehicleData.modelo || extracted.modelo,
      marca: vehicleData.marca || extracted.marca,
      altura: vehicleData.altura || 0,
      largura: vehicleData.largura || 0,
      motor: vehicleData.motor || 'N/A',
      potencia: vehicleData.potencia || 0,
      consumo: vehicleData.consumo || 0,
      ano: vehicleData.ano || 2023,
      categoria: vehicleData.categoria || 'N/A',
      combustivel: vehicleData.combustivel || 'N/A',
      tracao: vehicleData.tracao || 'N/A',
      portas: vehicleData.portas || 4,
      lugares: vehicleData.lugares || 5,
      transmissao: vehicleData.transmissao || 'N/A',
      fonte: vehicleData.fonte || 'API Ninjas',
      atualizado_em: new Date().toISOString()
    }
    
    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
    
  } catch (error) {
    console.error('❌ Erro:', error)
    
    return new Response(
      JSON.stringify({
        error: 'Erro interno',
        message: error.message
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})