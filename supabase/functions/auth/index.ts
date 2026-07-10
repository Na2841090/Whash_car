// supabase/functions/auth/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  hashSync,
  compareSync,
  genSaltSync,
} from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create as createJWT } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const JWT_SECRET =
  Deno.env.get("JWT_SECRET") || "my-super-secret-jwt-key-for-wash-app-2026";

// ============================================
// 🔥 DECODIFICAR JWT
// ============================================
function decodeJWT(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { success: false, error: `Token inválido: ${parts.length} partes` };
    }

    const base64UrlDecode = (str: string): string => {
      let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      return atob(base64);
    };

    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload = JSON.parse(base64UrlDecode(parts[1]));

    return {
      success: true,
      header,
      payload,
      plain_text: {
        userId: payload.userId || payload.sub || null,
        email: payload.email || null,
        firstName: payload.firstName || null,
        lastName: payload.lastName || null,
        state: payload.state || null,
        sessionId: payload.sessionId || null,
        exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
        iat: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================
// 🔥 EXTRAIR TOKEN
// ============================================
function extractToken(req: Request): { token: string | null; error: string | null } {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return { token: null, error: 'No Authorization header provided' };
    }
    if (!authHeader.startsWith('Bearer ')) {
      return { token: null, error: 'Authorization header must be Bearer token' };
    }
    const token = authHeader.split(' ')[1];
    if (!token || token.length < 10) {
      return { token: null, error: 'Invalid token format' };
    }
    return { token, error: null };
  } catch (error) {
    return { token: null, error: error.message };
  }
}

// ============================================
// FUNÇÕES JWT
// ============================================
async function generateJWT(payload: any): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  const jwt = await createJWT(
    { alg: "HS256", typ: "JWT" },
    {
      sub: payload.userId,
      userId: payload.userId,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      state: payload.state,
      sessionId: payload.sessionId || null,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    },
    key,
  );

  return jwt;
}

function generateRefreshToken(): string {
  return crypto.randomUUID();
}

// ============================================
// SERVE (COM TRATAMENTO DE ERRO ROBUSTO)
// ============================================
serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { 
      headers: corsHeaders,
      status: 200,
    });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();

    console.log(`📝 Auth request: ${req.method} ${path}`);

    // Roteamento
    if (path === "login") {
      return await handleLogin(req);
    } else if (path === "register") {
      return await handleRegister(req);
    } else if (path === "verify") {
      return await handleVerify(req);
    } else if (path === "refresh") {
      return await handleRefresh(req);
    } else if (path === "logout") {
      return await handleLogout(req);
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Invalid endpoint",
          available: ["login", "register", "verify", "refresh", "logout"]
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }
  } catch (error) {
    console.error("Auth error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Internal server error",
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

// ============================================
// REGISTER
// ============================================
async function handleRegister(req: Request) {
  try {
    // Ler body com try-catch
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('Body parse error:', parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON body',
          details: parseError.message,
          hint: 'Make sure you are sending a valid JSON with Content-Type: application/json',
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!body || Object.keys(body).length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Empty request body',
          hint: 'Please send: { "email": "...", "password": "...", ... }',
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, firstName, lastName, phone, zipCode } = body;

    if (!email || !password || !firstName || !lastName || !phone || !zipCode) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "All fields required",
          received: { email: !!email, password: !!password, firstName: !!firstName, lastName: !!lastName, phone: !!phone, zipCode: !!zipCode }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ success: false, error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const usPhoneRegex = /^\+1\d{10}$/;
    if (!usPhoneRegex.test(phone)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid US phone number. Format: +1XXXXXXXXXX" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    // Verificar se email já existe
    const { data: existingUser } = await supabase
      .from("users")
      .select("email")
      .eq("email", email)
      .single();

    if (existingUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Email already registered" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hash da senha
    const salt = genSaltSync(10);
    const passwordHash = hashSync(password, salt);

    // Inserir usuário
    const { data: user, error: userError } = await supabase
      .from("users")
      .insert({
        email,
        password_hash: passwordHash,
        phone,
        first_name: firstName,
        last_name: lastName,
        state: "TX",
        zip_code: zipCode,
        is_active: true,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (userError) {
      console.error("Error creating user:", userError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create user", details: userError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
        },
        message: "Registration successful! Please login.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Register error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Registration failed", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ============================================
// LOGIN
// ============================================
async function handleLogin(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('Body parse error:', parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON body',
          details: parseError.message,
          hint: 'Make sure you are sending a valid JSON with Content-Type: application/json',
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!body || Object.keys(body).length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Empty request body',
          hint: 'Please send: { "email": "...", "password": "..." }',
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password } = body;

    if (!email || !password) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email and password required",
          received: { email: !!email, password: !!password },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .eq("is_active", true)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email or password" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const passwordMatch = compareSync(password, user.password_hash);
    if (!passwordMatch) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email or password" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Criar sessão
    const sessionId = crypto.randomUUID();
    const refreshToken = generateRefreshToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600000);
    const refreshExpiresAt = new Date(now.getTime() + 7 * 24 * 3600000);

    const token = await generateJWT({
      userId: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      state: user.state,
      sessionId: sessionId,
    });

    // Desativar sessões antigas
    await supabase
      .from("sessions")
      .update({ is_active: false })
      .eq("user_id", user.id)
      .eq("is_active", true);

    // Salvar sessão
    const { error: sessionError } = await supabase
      .from("sessions")
      .insert({
        id: sessionId,
        user_id: user.id,
        token: token,
        refresh_token: refreshToken,
        expires_at: expiresAt.toISOString(),
        refresh_expires_at: refreshExpiresAt.toISOString(),
        ip_address: req.headers.get("x-forwarded-for") || "unknown",
        user_agent: req.headers.get("user-agent") || "unknown",
        is_active: true,
        request_count: 0,
        last_request_at: now.toISOString(),
        created_at: now.toISOString(),
      });

    if (sessionError) {
      console.error("Error creating session:", sessionError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          state: user.state,
          zipCode: user.zip_code,
        },
        token: token,
        refresh_token: refreshToken,
        expires_in: 3600,
        session_id: sessionId,
        message: "Login successful",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Login error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Login failed", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ============================================
// VERIFY
// ============================================
async function handleVerify(req: Request) {
  try {
    const { token, error: tokenError } = extractToken(req);
    if (tokenError) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - " + tokenError }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const decoded = decodeJWT(token!);
    if (!decoded.success) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    if (decoded.payload.exp && decoded.payload.exp < now) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - Token expired" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("*, users!inner(*)")
      .eq("token", token)
      .eq("is_active", true)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ success: false, error: "Session not found or inactive" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const expiresAt = new Date(session.expires_at);
    if (new Date() > expiresAt) {
      await supabase
        .from("sessions")
        .update({ is_active: false })
        .eq("id", session.id);
      return new Response(
        JSON.stringify({ success: false, error: "Session expired" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: session.users.id,
          email: session.users.email,
          firstName: session.users.first_name,
          lastName: session.users.last_name,
          phone: session.users.phone,
          state: session.users.state,
          zipCode: session.users.zip_code,
        },
        session_id: session.id,
        expires_in: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Verify error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Invalid token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ============================================
// REFRESH TOKEN
// ============================================
async function handleRefresh(req: Request) {
  try {
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { refresh_token } = body;

    if (!refresh_token) {
      return new Response(
        JSON.stringify({ success: false, error: "Refresh token required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("*, users!inner(*)")
      .eq("refresh_token", refresh_token)
      .eq("is_active", true)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid refresh token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const refreshExpiresAt = new Date(session.refresh_expires_at);
    if (new Date() > refreshExpiresAt) {
      await supabase
        .from("sessions")
        .update({ is_active: false })
        .eq("id", session.id);
      return new Response(
        JSON.stringify({ success: false, error: "Refresh token expired" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gerar novos tokens
    const newSessionId = crypto.randomUUID();
    const newRefreshToken = generateRefreshToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600000);

    const newToken = await generateJWT({
      userId: session.user_id,
      email: session.users.email,
      firstName: session.users.first_name,
      lastName: session.users.last_name,
      state: session.users.state,
      sessionId: newSessionId,
    });

    // Desativar sessão antiga e criar nova
    await supabase
      .from("sessions")
      .update({ is_active: false })
      .eq("id", session.id);

    await supabase
      .from("sessions")
      .insert({
        id: newSessionId,
        user_id: session.user_id,
        token: newToken,
        refresh_token: newRefreshToken,
        expires_at: expiresAt.toISOString(),
        refresh_expires_at: session.refresh_expires_at,
        ip_address: session.ip_address,
        user_agent: session.user_agent,
        is_active: true,
        request_count: 0,
        last_request_at: now.toISOString(),
        created_at: now.toISOString(),
      });

    return new Response(
      JSON.stringify({
        success: true,
        token: newToken,
        refresh_token: newRefreshToken,
        expires_in: 3600,
        session_id: newSessionId,
        message: "Token refreshed successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Refresh error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Refresh failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ============================================
// LOGOUT
// ============================================
async function handleLogout(req: Request) {
  try {
    const { token, error: tokenError } = extractToken(req);
    if (tokenError) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - " + tokenError }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const { error: logoutError } = await supabase
      .from("sessions")
      .update({ is_active: false })
      .eq("token", token);

    if (logoutError) {
      console.error("Logout error:", logoutError);
      return new Response(
        JSON.stringify({ success: false, error: "Logout failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Logged out successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Logout error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Logout failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}