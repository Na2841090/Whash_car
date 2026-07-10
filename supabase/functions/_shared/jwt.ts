// supabase/functions/_shared/jwt.ts
import { create as createJWT, verify as verifyJWT } from 'https://deno.land/x/djwt@v2.9.1/mod.ts';

// 🔥 JWT_SECRET CENTRALIZADO
export const JWT_SECRET = Deno.env.get('JWT_SECRET') || 'my-super-secret-jwt-key-for-wash-app-2026';

export async function generateJWT(payload: any): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  const jwt = await createJWT(
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: payload.userId,
      userId: payload.userId,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      state: payload.state,
      sessionId: payload.sessionId,
      exp: payload.exp || Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    },
    key
  );

  return jwt;
}

export async function verifyJWT(token: string): Promise<any> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
    const { payload } = await verifyJWT(token, key);
    return payload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}