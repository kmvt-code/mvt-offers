// Every action the pipeline takes without a person: auto publish, auto merge,
// news routing. Each row keeps enough to undo it from the Activity tab.
// Logging never blocks the action it describes.
export async function logActivity(supabase, entry) {
  try {
    await supabase.from('activity_log').insert({
      action: entry.action,
      offer_id: entry.offer_id || null,
      target_id: entry.target_id || null,
      update_id: entry.update_id || null,
      vendor: entry.vendor || null,
      score: entry.score != null ? Math.round(entry.score) : null,
      details: entry.details || null
    });
  } catch (e) {
    console.error('[activity] could not log', entry.action, e && e.message);
  }
}
