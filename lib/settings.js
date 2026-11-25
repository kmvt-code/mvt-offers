import { normalizeSettings } from './scoring';

// Pipeline thresholds live in one row of app_settings so the admin sliders can
// change them without a redeploy. Falls back to defaults if the table is
// missing, so a deploy that lands before the migration still works.
export async function loadSettings(supabase) {
  try {
    const { data, error } = await supabase
      .from('app_settings').select('value').eq('key', 'pipeline').maybeSingle();
    if (error) return normalizeSettings(null);
    return normalizeSettings(data ? data.value : null);
  } catch {
    return normalizeSettings(null);
  }
}

export async function saveSettings(supabase, values) {
  const clean = normalizeSettings(values);
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'pipeline', value: clean, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  return clean;
}
