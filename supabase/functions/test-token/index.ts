// supabase/functions/test-token/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { compareSync } from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';
import { create as createJWT, verify as verifyJWT } from 'https://deno.land/x/djwt@v2.9.1/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
};

// 🔥 JWT_SECRET - MESMO PARA GERAR E VALIDAR!
const JWT_SECRET = 'my-super-secret-jwt-key-for-wash-app-2026';

console.log('🔑 ========================================');
console.log('🔑 JWT_SECRET:', JWT_SECRET);
console.log('🔑 JWT_SECRET length:', JWT_SECRET.length);
console.log('🔑 ========================================');

// ============================================
// GERAR JWT TOKEN
// ============================================
async function generateToken(payload: {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  state: string;
  expiresIn?: number;
}): Promise<string> {
  console.log('🔑 GENERATE - Using JWT_SECRET:', JWT_SECRET);
  console.log('🔑 GENERATE - JWT_SECRET length:', JWT_SECRET.length);
  
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  const expiresIn = payload.expiresIn || 86400;
  const now = Math.floor(Date.now() / 1000);

  const jwt = await createJWT(
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: payload.userId,
      userId: payload.userId,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      state: payload.state,
      exp: now + expiresIn,
      iat: now,
    },
    key
  );

  console.log('✅ GENERATE - Token generated, length:', jwt.length);
  console.log('✅ GENERATE - Token preview:', jwt.substring(0, 50) + '...');
  return jwt;
}

// ============================================
// VALIDAR JWT TOKEN
// ============================================
async function validateToken(token: string): Promise<any> {
  try {
    console.log('🔑 VALIDATE - Using JWT_SECRET:', JWT_SECRET);
    console.log('🔑 VALIDATE - JWT_SECRET length:', JWT_SECRET.length);
    console.log('🔑 VALIDATE - Token length:', token.length);
    console.log('🔑 VALIDATE - Token preview:', token.substring(0, 50) + '...');
    
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );

    const { payload } = await verifyJWT(token, key);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.error('❌ VALIDATE - Token expired');
      return null;
    }

    console.log('✅ VALIDATE - Token is VALID!');
    console.log('✅ VALIDATE - Payload:', payload);
    return payload;
  } catch (error) {
    console.error('❌ VALIDATE - JWT verification failed:', error.message);
    console.error('❌ VALIDATE - Error stack:', error.stack);
    return null;
  }
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

    console.log(`📝 Test-Token request: ${req.method} ${path}`);

    if (path === 'login') {
      return await handleLogin(req);
    } else if (path === 'verify') {
      return await handleVerify(req);
    } else if (path === 'generate') {
      return await handleGenerate(req);
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid endpoint. Use /login, /verify or /generate',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('Test-Token error:', error);
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
// HANDLER: GENERATE (manual)
// ============================================
async function handleGenerate(req: Request) {
  try {
    const { userId, email, firstName, lastName, state } = await req.json();

    if (!userId || !email) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'userId and email required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('🔑 GENERATE HANDLER - Creating token for:', email);
    
    const token = await generateToken({
      userId: userId,
      email: email,
      firstName: firstName || 'Test',
      lastName: lastName || 'User',
      state: state || 'TX',
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: '✅ Token generated manually!',
        token: token,
        token_length: token.length,
        jwt_secret_used: JWT_SECRET,
        payload: {
          userId,
          email,
          firstName: firstName || 'Test',
          lastName: lastName || 'User',
          state: state || 'TX',
        },
        expires_in: 86400,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Generate error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Generation failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}

// ============================================
// HANDLER: VERIFY
// ============================================
async function handleVerify(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No token provided. Use: Authorization: Bearer <token>',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const token = authHeader.split(' ')[1];
    console.log('🔑 VERIFY HANDLER - Token received');
    console.log('🔑 VERIFY HANDLER - Token length:', token.length);
    console.log('🔑 VERIFY HANDLER - Token preview:', token.substring(0, 50) + '...');

    const payload = await validateToken(token);

    if (!payload) {
      return new Response(
        JSON.stringify({
          success: false,
          error: '❌ Invalid or expired token',
          token_provided: token.substring(0, 30) + '...',
          token_length: token.length,
          jwt_secret_used: JWT_SECRET,
          suggestion: 'Try generating a new token via /test-token/login',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: '✅ Token is VALID!',
        jwt_secret_used: JWT_SECRET,
        payload: {
          userId: payload.userId,
          email: payload.email,
          firstName: payload.firstName,
          lastName: payload.lastName,
          state: payload.state,
          expires_in: payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : 'unknown',
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Verify error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Verification failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}

// ============================================
// HANDLER: LOGIN
// ============================================
async function handleLogin(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Email and password required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'User not found',
          details: userError?.message || 'No user with this email',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('🔐 Verifying password...');
    
    let passwordMatch = false;
    try {
      passwordMatch = compareSync(password, user.password_hash);
    } catch (bcryptError) {
      console.error('❌ Bcrypt error:', bcryptError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Password verification error',
          details: bcryptError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    console.log('🔐 Password match:', passwordMatch);

    if (!passwordMatch) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid password',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const token = await generateToken({
      userId: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      state: user.state,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: '✅ Token generated successfully!',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
        },
        token: token,
        token_length: token.length,
        jwt_secret_used: JWT_SECRET,
        expires_in: 86400,
        how_to_use: 'Copy the token above and use it in: Authorization: Bearer <token>',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Login failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}