// supabase/functions/admin-compliance/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createSupabaseClient, getAuthenticatedUser } from '../_shared/supabase.ts';
import { corsHeaders, US_STATES } from '../_shared/constants.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = await getAuthenticatedUser(authHeader);
    const supabase = createSupabaseClient(authHeader);

    // Verificar se é admin
    const { data: adminCheck } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminCheck?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, state, washerId } = await req.json();

    // === Ação: Get Compliance Status ===
    if (action === 'get_compliance_status') {
      let query = supabase
        .from('washers')
        .select(`
          id,
          user_id,
          state,
          is_active,
          driver_license_expiry,
          worker_classification,
          created_at,
          users:user_id(first_name, last_name, email, phone),
          insurances(expiry_date, coverage_amount, is_valid),
          background_checks(status, expiry_date)
        `);

      if (state) {
        query = query.eq('state', state);
      }

      const { data: washers, error } = await query;

      if (error) {
        console.error('Error fetching compliance data:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const complianceData = washers.map((washer: any) => ({
        ...washer,
        compliance_status: {
          insurance_valid: washer.insurances?.some((i: any) => i.is_valid) || false,
          background_valid: washer.background_checks?.some((b: any) => b.status === 'approved') || false,
          license_valid: new Date(washer.driver_license_expiry) > new Date(),
          is_compliant: washer.is_active,
        },
        documents_expiring: {
          insurance: washer.insurances?.filter((i: any) => {
            const expiry = new Date(i.expiry_date);
            const daysUntil = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return daysUntil < 30 && daysUntil > 0;
          }) || [],
          license: new Date(washer.driver_license_expiry) > new Date() && 
                   new Date(washer.driver_license_expiry) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          background: washer.background_checks?.filter((b: any) => {
            const expiry = new Date(b.expiry_date);
            const daysUntil = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return daysUntil < 30 && daysUntil > 0;
          }) || [],
        },
        state_config: US_STATES[washer.state],
      }));

      return new Response(
        JSON.stringify({
          success: true,
          data: complianceData,
          summary: {
            total_washers: complianceData.length,
            active: complianceData.filter((w: any) => w.is_active).length,
            pending_compliance: complianceData.filter((w: any) => !w.is_active).length,
            expiring_documents: complianceData.filter((w: any) => 
              w.documents_expiring.insurance.length > 0 || 
              w.documents_expiring.license ||
              w.documents_expiring.background.length > 0
            ).length,
          },
          state_filter: state || 'all',
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // === Ação: Auto-disable expired documents ===
    if (action === 'auto_disable') {
      const { data: expiringWashers } = await supabase
        .from('washers')
        .select('id, user_id, driver_license_expiry')
        .or(`driver_license_expiry.lt.${new Date().toISOString()}`)
        .eq('is_active', true);

      let disabledCount = 0;

      for (const washer of expiringWashers || []) {
        await supabase
          .from('washers')
          .update({ is_active: false })
          .eq('id', washer.id);

        await supabase
          .from('audit_logs')
          .insert({
            user_id: washer.user_id,
            action: 'auto_disabled',
            details: { 
              reason: 'Expired documents',
              washer_id: washer.id,
              driver_license_expiry: washer.driver_license_expiry,
            },
            timestamp: new Date().toISOString(),
          });

        await sendNotification(washer.user_id, {
          title: 'Account Suspended',
          message: 'Your washer account has been suspended due to expired documents. Please update your documents.',
        });

        disabledCount++;
      }

      return new Response(
        JSON.stringify({
          success: true,
          disabled_count: disabledCount,
          message: `${disabledCount} accounts disabled due to expired documents`,
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // === Ação: Generate 1099-K Report ===
    if (action === 'generate_1099') {
      const year = new Date().getFullYear();
      
      const { data: report, error } = await supabase
        .rpc('generate_1099_report', {
          tax_year: year,
          state_filter: state || null,
        });

      if (error) {
        console.error('Error generating 1099:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          year: year,
          washers: report,
          total_washers: report?.length || 0,
          total_amount: report?.reduce((sum: number, w: any) => sum + (w.total_earnings || 0), 0) || 0,
          threshold: {
            amount: 20000,
            transactions: 200,
          },
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // === Ação: Get State Dashboard ===
    if (action === 'state_dashboard') {
      const states = Object.keys(US_STATES);
      const dashboard: any = {};

      for (const stateCode of states) {
        const { count, error } = await supabase
          .from('washers')
          .select('id', { count: 'exact', head: true })
          .eq('state', stateCode);

        const { count: activeCount } = await supabase
          .from('washers')
          .select('id', { count: 'exact', head: true })
          .eq('state', stateCode)
          .eq('is_active', true);

        const { data: revenue } = await supabase
          .from('orders')
          .select('price')
          .eq('state', stateCode)
          .eq('status', 'COMPLETED');

        const totalRevenue = revenue?.reduce((sum: number, o: any) => sum + (o.price?.total || 0), 0) || 0;

        dashboard[stateCode] = {
          state: US_STATES[stateCode],
          total_washers: count || 0,
          active_washers: activeCount || 0,
          total_revenue: totalRevenue,
          average_rating: 4.5, // Simulado
          compliance_rate: activeCount && count ? (activeCount / count * 100) : 0,
        };
      }

      return new Response(
        JSON.stringify({
          success: true,
          dashboard,
          total_washers: Object.values(dashboard).reduce((sum: number, d: any) => sum + d.total_washers, 0),
          total_revenue: Object.values(dashboard).reduce((sum: number, d: any) => sum + d.total_revenue, 0),
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Invalid action. Available: get_compliance_status, auto_disable, generate_1099, state_dashboard' 
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Admin compliance error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Helper: Notificação
async function sendNotification(userId: string, data: any) {
  // Integração com FCM/APNS
  console.log(`📱 Sending notification to ${userId}:`, data);
}