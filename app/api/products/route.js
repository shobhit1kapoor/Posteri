import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('products')
      .select('id, slug, name, description, department, category, price_cents, currency')
      .eq('active', true)
      .order('created_at');

    if (error) throw error;
    return Response.json({ products: data });
  } catch (error) {
    return Response.json({ error: 'Product catalogue is unavailable.' }, { status: 503 });
  }
}
