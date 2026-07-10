// supabase/functions/_shared/token-service.ts
import { create as createJWT, verify as verifyJWT } from 'https://deno.land/x/djwt@v2.9.1/mod.ts';

// 🔥 JWT_SECRET FIXO PARA TESTE - USE O MESMO EM TODOS OS LUGARES!
const JWT_SECRET = 'my-super-secret-jwt-key-for-wash-app-2026';

console.log('🔑 ========================================');
console.log('🔑 JWT_SECRET:', JWT_SECRET);
console.log('🔑 JWT_SECRET length:', JWT_SECRET.length);
console.log('🔑 ========================================');

// ============================================
// GERAR JWT TOKEN
// ============================================
export async function generateToken(payload: {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  state: string;
  expiresIn?: number;
}): Promise<string> {
  console.log('🔑 Generating token for:', payload.email);
  console.log('🔑 Using JWT_SECRET:', JWT_SECRET);
  
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

  console.log('✅ Token generated, length:', jwt.length);
  console.log('✅ Token preview:', jwt.substring(0, 30) + '...');
  return jwt;
}

// ============================================
// VALIDAR JWT TOKEN
// ============================================
export async function validateToken(token: string): Promise<any> {
  try {
    console.log('🔑 Validating token...');
    console.log('🔑 Token length:', token.length);
    console.log('🔑 Token preview:', token.substring(0, 30) + '...');
    console.log('🔑 Using JWT_SECRET:', JWT_SECRET);
    
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
      console.error('❌ Token expired');
      return null;
    }

    console.log('✅ Token is VALID!');
    console.log('✅ Payload:', payload);
    return payload;
  } catch (error) {
    console.error('❌ JWT verification failed:', error.message);
    return null;
  }
}

// ============================================
// DECODIFICAR TOKEN (sem validar)
// ============================================
export function decodeToken(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch (error) {
    console.error('Token decode failed:', error);
    return null;
  }
}