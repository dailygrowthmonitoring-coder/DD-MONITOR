'use server';

import { createSSRClient }                                       from '@/lib/db/client-ssr';
import { logger }                                                from '@/lib/logger';
import type { AlertRuleSeverity, DeviceGroup }                   from '@/lib/db/types';

async function verifyAdmin() {
  const supabase = await createSSRClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');
  const { data: role } = await supabase.rpc('get_current_user_role');
  if (role !== 'admin') throw new Error('Forbidden');
  return { supabase, userId: user.id };
}

export async function updateAlertRule(
  id: string,
  updates: { threshold?: number | null; severity?: AlertRuleSeverity; enabled?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await verifyAdmin();
    const { error } = await supabase.from('alert_rules').update(updates).eq('id', id);
    if (error) throw error;
    logger.info('settings', 'alert_rule updated', { id, ...updates, userId });
    return { ok: true };
  } catch (err) {
    logger.error('settings', 'updateAlertRule failed', { id, error: String(err) });
    return { ok: false, error: String(err) };
  }
}

export async function updateDevice(
  id: string,
  updates: {
    display_name?: string | null;
    device_group?: DeviceGroup | null;
    location?: string | null;
    is_active?: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await verifyAdmin();
    const { error } = await supabase.from('devices').update(updates).eq('id', id);
    if (error) throw error;
    logger.info('settings', 'device updated', { id, ...updates, userId });
    return { ok: true };
  } catch (err) {
    logger.error('settings', 'updateDevice failed', { id, error: String(err) });
    return { ok: false, error: String(err) };
  }
}

export async function upsertAppSetting(
  key: string,
  value: unknown,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await verifyAdmin();
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key, value: value as never });
    if (error) throw error;
    logger.info('settings', 'app_setting upserted', { key, userId });
    return { ok: true };
  } catch (err) {
    logger.error('settings', 'upsertAppSetting failed', { key, error: String(err) });
    return { ok: false, error: String(err) };
  }
}
