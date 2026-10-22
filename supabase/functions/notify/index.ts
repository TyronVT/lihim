// notify: Web Push to every active member of a group, identically.
//
//   { type: 'poll_opened', poll_id }   from the polls trigger  → "New poll in <group>"
//   { type: 'closing_soon' }           from pg_cron (10 min)    → "Poll closes in 2 hours — <group>"
//
// Never targets a subset of members. In particular there is no "you haven't
// voted yet": the server does not know who answered, and must not look like it does.

import { type SupabaseClient, webpush } from '../_shared/deps.ts';
import { env } from '../_shared/env.ts';
import { assertCron, handler, HttpError, json, readJson } from '../_shared/http.ts';
import { adminClient } from '../_shared/supabase.ts';

const REMINDER_WINDOW_MS = 2 * 60 * 60 * 1000;
// Don't send a closing reminder for a poll that was only open for a few hours.
const MIN_POLL_LENGTH_FOR_REMINDER_MS = 3 * 60 * 60 * 1000;
const SEND_CONCURRENCY = 25;

interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  icon: string;
  badge: string;
  group_id: string;
  poll_id: string;
}

interface PollRow {
  id: string;
  title: string;
  group_id: string;
  opens_at: string | null;
  closes_at: string;
  groups: { name: string } | null;
}

Deno.serve(handler(async (req) => {
  assertCron(req);
  const body = await readJson<{ type?: string; poll_id?: string }>(req);
  const db = adminClient();
  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

  if (body.type === 'poll_opened') {
    if (!body.poll_id) throw new HttpError(400, 'invalid', 'poll_id required');
    const { data: poll, error } = await db
      .from('polls')
      .select('id, title, group_id, opens_at, closes_at, status, groups(name)')
      .eq('id', body.poll_id)
      .maybeSingle();
    if (error) throw error;
    if (!poll || poll.status !== 'open') return json(null, { ok: true, sent: 0, skipped: 'not_open' });
    const p = poll as unknown as PollRow;
    const sent = await pushToGroup(db, p.group_id, payloadFor(p, `New poll in ${groupName(p)}`));
    return json(null, { ok: true, ...sent });
  }

  if (body.type === 'closing_soon') {
    const now = Date.now();
    // Claim first (atomic per row), then send, so overlapping cron runs never double-send.
    const { data: claimed, error } = await db
      .from('polls')
      .update({ closing_reminder_sent_at: new Date(now).toISOString() })
      .eq('status', 'open')
      .is('closing_reminder_sent_at', null)
      .gt('closes_at', new Date(now).toISOString())
      .lte('closes_at', new Date(now + REMINDER_WINDOW_MS).toISOString())
      .select('id, title, group_id, opens_at, closes_at, groups(name)');
    if (error) throw error;

    let total = 0;
    for (const p of (claimed ?? []) as unknown as PollRow[]) {
      const length = new Date(p.closes_at).getTime() - new Date(p.opens_at ?? p.closes_at).getTime();
      if (length < MIN_POLL_LENGTH_FOR_REMINDER_MS) continue;
      const left = closesInText(new Date(p.closes_at).getTime() - now);
      total += (await pushToGroup(db, p.group_id, payloadFor(p, `Poll closes in ${left} — ${groupName(p)}`))).sent;
    }
    return json(null, { ok: true, polls: claimed?.length ?? 0, sent: total });
  }

  throw new HttpError(400, 'invalid', 'unknown type');
}));

function groupName(p: PollRow): string {
  return p.groups?.name ?? 'your group';
}

function closesInText(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes >= 90) return '2 hours';
  if (minutes >= 45) return '1 hour';
  return `${minutes} minutes`;
}

/** Web routes (D6): a poll is /p/{polls.id}, a group is /g/{groups.id}. */
function pollPath(pollId: string): string {
  return `/p/${encodeURIComponent(pollId)}`;
}

function payloadFor(p: PollRow, title: string): PushPayload {
  return {
    title,
    body: p.title,
    url: pollPath(p.id),
    tag: `poll-${p.id}`,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    group_id: p.group_id,
    poll_id: p.id,
  };
}

/** Same payload to every subscription of every active member; nothing per-person. */
async function pushToGroup(db: SupabaseClient, groupId: string, payload: PushPayload) {
  const { data: members, error } = await db
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('status', 'active');
  if (error) throw error;
  const userIds = (members ?? []).map((m) => m.user_id);
  if (!userIds.length) return { sent: 0, gone: 0, failed: 0 };

  const subs: { endpoint: string; keys: { p256dh: string; auth: string } }[] = [];
  for (let i = 0; i < userIds.length; i += 200) {
    const { data, error: subError } = await db
      .from('push_subscriptions')
      .select('endpoint, keys')
      .in('user_id', userIds.slice(i, i + 200));
    if (subError) throw subError;
    subs.push(...(data ?? []));
  }
  // A shared device can hold the same endpoint for two accounts; send once.
  const unique = [...new Map(subs.map((s) => [s.endpoint, s])).values()];

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  for (let i = 0; i < unique.length; i += SEND_CONCURRENCY) {
    const results = await Promise.allSettled(
      unique.slice(i, i + SEND_CONCURRENCY).map((s) =>
        webpush.sendNotification(s, body, { TTL: 6 * 60 * 60, urgency: 'normal', topic: payload.tag.slice(0, 32) })
      ),
    );
    results.forEach((r, j) => {
      if (r.status === 'fulfilled') return void sent++;
      const code = (r.reason as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) gone.push(unique[i + j].endpoint);
      else failed++;
    });
  }
  if (gone.length) await db.from('push_subscriptions').delete().in('endpoint', gone);
  return { sent, gone: gone.length, failed };
}
