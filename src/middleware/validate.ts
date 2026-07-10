// src/middleware/validate.ts
import { supabase } from '../lib/supabase';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  userId?: string;
}

// Validar token JWT
export async function validateAuth(token: string): Promise<ValidationResult> {
  if (!token) {
    return { valid: false, error: 'Token não fornecido' };
  }

  const { data: { user }, error } = await supabase.auth.getUser(token.replace('Bearer ', ''));

  if (error || !user) {
    return { valid: false, error: 'Token inválido ou expirado' };
  }

  return { valid: true, userId: user.id };
}

// Validar role do usuário
export async function validateRole(userId: string, requiredRole: 'client' | 'washer' | 'admin'): Promise<ValidationResult> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return { valid: false, error: 'Perfil não encontrado' };
  }

  if (profile.role !== requiredRole && requiredRole !== 'admin') {
    return { valid: false, error: `Acesso negado. Role ${requiredRole} necessário.` };
  }

  return { valid: true };
}

// Validar dados do pedido
export function validateOrderData(data: any): ValidationResult {
  const required = ['vehicle_id', 'service_id', 'pickup_address', 'delivery_address', 'scheduled_at'];
  
  for (const field of required) {
    if (!data[field]) {
      return { valid: false, error: `Campo obrigatório: ${field}` };
    }
  }

  // Validar data futura
  const scheduledDate = new Date(data.scheduled_at);
  if (scheduledDate < new Date()) {
    return { valid: false, error: 'Data deve ser futura' };
  }

  // Validar endereços
  if (data.pickup_address === data.delivery_address && !data.same_address) {
    data.same_address = true;
  }

  return { valid: true };
}