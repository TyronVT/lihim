import { createClient, type SupabaseClient, type User } from './deps.ts';
import { env } from './env.ts';
import { HttpError } from './http.ts';

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** Service-role client. Bypasses RLS: only use after the caller has been authorized in code. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), noSession);
}

/** Anon-key client, used only to exchange a one-time token for a session. */
export function anonClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), noSession);
}

/** The user behind the request's Bearer JWT, verified against Supabase Auth. */
export async function requireUser(req: Request, db: SupabaseClient): Promise<User> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'unauthorized');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'unauthorized');
  return data.user;
}

/**
 * Mark a group live once create_group is confirmed and add the admin to its
 * roster. Shared by submit-admin-tx (fast path) and the indexer (reconciles
 * when the function timed out before confirmation).
 */
export async function activateGroup(db: SupabaseClient, groupId: string, chainGroupId: bigint): Promise<void> {
  const { data: group, error } = await db
    .from('groups')
    .update({ chain_group_id: chainGroupId.toString(), status: 'active' })
    .eq('id', groupId)
    .is('chain_group_id', null)
    .select('id, admin_user_id')
    .maybeSingle();
  if (error) throw error;
  if (!group) return; // already active

  const { data: profile } = await db.from('profiles').select('display_name').eq('id', group.admin_user_id).maybeSingle();
  const { error: memberError } = await db.from('group_members').upsert(
    {
      group_id: group.id,
      user_id: group.admin_user_id,
      display_name: profile?.display_name?.trim() || 'Admin',
    },
    { onConflict: 'group_id,user_id', ignoreDuplicates: true },
  );
  if (memberError) throw memberError;
}

/** Root/tally mismatches, indexer gaps, keeper problems. One open alert per (kind, subject). */
export async function integrityAlert(
  db: SupabaseClient,
  kind: string,
  subject: string,
  details: Record<string, unknown>,
): Promise<void> {
  console.error(`integrity: ${kind} ${subject}`, details);
  const { data: open } = await db
    .from('integrity_alerts')
    .select('id')
    .eq('kind', kind)
    .eq('subject', subject)
    .is('resolved_at', null)
    .limit(1);
  if (open?.length) return; // one open alert per issue, not one per run
  await db.from('integrity_alerts').insert({ kind, subject, details });
}
