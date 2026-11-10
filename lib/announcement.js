import { supabasePublic } from './supabase';

// The banner currently allowed by the public policy (active, inside its
// Pacific date window). If the table is missing or the read fails, the site
// simply shows no banner rather than failing to load.
export async function currentAnnouncement() {
  try {
    const { data, error } = await supabasePublic
      .from('announcements')
      .select('message')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || !data.length) return null;
    return data[0].message || null;
  } catch {
    return null;
  }
}
