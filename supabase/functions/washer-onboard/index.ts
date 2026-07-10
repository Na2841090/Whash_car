// supabase/functions/washer-onboard/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { decodeJWT, extractToken, corsHeaders } from '../_shared/auth.ts';

// ============================================
// CONSTANTS - US STATES
// ============================================
const US_STATES: Record<string, any> = {
  CA: { name: 'California', minInsurance: 1000000, workerClassification: 'W2' },
  TX: { name: 'Texas', minInsurance: 500000, workerClassification: '1099' },
  FL: { name: 'Florida', minInsurance: 500000, workerClassification: '1099' },
  NY: { name: 'New York', minInsurance: 1000000, workerClassification: '1099' },
  NV: { name: 'Nevada', minInsurance: 500000, workerClassification: '1099' },
  OR: { name: 'Oregon', minInsurance: 500000, workerClassification: '1099' },
  WA: { name: 'Washington', minInsurance: 1000000, workerClassification: '1099' },
};

// ============================================
// SERVE
// ============================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 🔥 1. AUTHENTICATION (mesmo padrão do hello)
    const { token, error: tokenError } = extractToken(req);
    if (tokenError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - ' + tokenError }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const decoded = decodeJWT(token!);
    if (!decoded.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Unauthorized - Invalid token: ' + decoded.error 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    if (decoded.payload.exp && decoded.payload.exp < now) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Token expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 2. BUSCAR USUÁRIO (cliente normal)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const userId = decoded.payload.userId || decoded.payload.sub;
    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - User ID not found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .eq('is_active', true)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - User not found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ User authenticated:', user.email);

    // 🔥 3. LER BODY
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON format',
          details: parseError.message,
          hint: 'Check for missing commas, quotes, or trailing commas in your JSON',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!body || Object.keys(body).length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Empty request body',
          hint: 'Make sure you are sending a JSON body with Content-Type: application/json',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📝 Body received:', JSON.stringify(body, null, 2));

    // ============================================
    // EXTRAIR DADOS DO BODY
    // ============================================
    const { 
      ssn,
      driverLicense,
      driverLicenseExpiry,
      state,
      vehicle,
      insurance,
      backgroundCheckConsent,
      referralCode
    } = body;

    // Validar campos obrigatórios
    if (!ssn || !driverLicense || !driverLicenseExpiry || !state) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required documents: ssn, driverLicense, driverLicenseExpiry, state',
          received: { 
            ssn: !!ssn, 
            driverLicense: !!driverLicense, 
            driverLicenseExpiry: !!driverLicenseExpiry, 
            state: !!state 
          },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validar estado
    const stateConfig = US_STATES[state];
    if (!stateConfig) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid state: ${state}. Must be one of: ${Object.keys(US_STATES).join(', ')}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 4. CRIAR CLIENTE ADMIN (SERVICE ROLE KEY - BYPASS RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verificar se já é lavador
    const { data: existingWasher } = await supabaseAdmin
      .from('washers')
      .select('id, is_active')
      .eq('user_id', user.id)
      .single();

    if (existingWasher) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'User already registered as washer',
          is_active: existingWasher.is_active,
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔥 5. HASH DO SSN
    const ssnHash = await hashSSN(ssn);

    // 🔥 6. INSERIR LAVADOR (COM ADMIN - BYPASS RLS)
    const { data: washer, error: washerError } = await supabaseAdmin
      .from('washers')
      .insert({
        user_id: user.id,
        ssn: ssnHash,
        driver_license: driverLicense,
        driver_license_expiry: driverLicenseExpiry,
        state: state,
        worker_classification: stateConfig.workerClassification,
        is_active: false,
        is_busy: false,
        coverage_radius: 15,
        vehicles: vehicle ? [vehicle] : [],
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (washerError) {
      console.error('Error creating washer:', washerError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to register washer',
          details: washerError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Washer created:', washer.id);

    // 🔥 7. REGISTRAR SEGURO
    let insuranceRecord = null;
    if (insurance) {
      if (insurance.coverage_amount < stateConfig.minInsurance) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Minimum insurance required: $${stateConfig.minInsurance}`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: ins, error: insError } = await supabaseAdmin
        .from('insurances')
        .insert({
          washer_id: washer.id,
          provider: insurance.provider,
          policy_number: insurance.policyNumber,
          coverage_amount: insurance.coverage_amount,
          expiry_date: insurance.expiryDate,
          document_url: insurance.documentUrl || null,
          is_valid: true,
        })
        .select()
        .single();

      if (!insError) {
        insuranceRecord = ins;
        console.log('✅ Insurance registered');
      }
    }

    // 🔥 8. BACKGROUND CHECK
    if (backgroundCheckConsent) {
      await supabaseAdmin
        .from('background_checks')
        .insert({
          washer_id: washer.id,
          provider: 'Checkr',
          status: 'pending',
          performed_at: new Date().toISOString(),
          expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
      console.log('✅ Background check initiated');
    }

    // 🔥 9. ATUALIZAR USUÁRIO (COM ADMIN)
    await supabaseAdmin
      .from('users')
      .update({ 
        is_washer: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    // 🔥 10. REGISTRAR LOG
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: user.id,
        action: 'washer_onboard',
        details: {
          washer_id: washer.id,
          state: state,
          worker_classification: stateConfig.workerClassification,
        },
        timestamp: new Date().toISOString(),
      });

    // 🔥 11. RETORNAR SUCESSO
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Washer registration submitted for review!',
        washer: {
          id: washer.id,
          state: washer.state,
          worker_classification: washer.worker_classification,
          is_active: false,
        },
        compliance_status: 'pending',
        state_config: {
          id: state,
          name: stateConfig.name,
          worker_classification: stateConfig.workerClassification,
          min_insurance: stateConfig.minInsurance,
        },
        documents_status: {
          background_check: backgroundCheckConsent ? 'pending' : 'not_started',
          insurance: insuranceRecord ? 'submitted' : 'not_submitted',
          identity: 'pending',
          license: 'pending',
        },
        next_steps: [
          'Complete identity verification',
          'Upload valid insurance document',
          'Complete background check',
          'Wait for admin approval',
        ],
        estimated_review_time: '2-5 business days',
        washer_id: washer.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Washer onboard error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================
// 🔥 HELPER FUNCTIONS
// ============================================

/**
 * Hash SSN using SHA-256
 * Never store SSN in plain text!
 */
async function hashSSN(ssn: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ssn);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}