// CORS, JSON responses and the cron shared-secret guard.

import { env, optionalEnv } from './env.ts';

function allowedOrigins(): string[] {
  return optionalEnv('APP_ORIGIN', '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/** CORS headers for browser-facing functions. Only APP_ORIGIN is ever echoed back. */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins().includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function json(req: Request | null, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(req ? corsHeaders(req) : {}) },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  return null;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    /** Extra fields for the JSON body, e.g. { error_code: 201 }. */
    public extra: Record<string, unknown> = {},
  ) {
    super(message ?? code);
  }
}

/** Wrap a handler so HttpError becomes a JSON error and anything else a 500 without internals. */
export function handler(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    const early = preflight(req);
    if (early) return early;
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json(req, { status: e.code, reason: e.message, ...e.extra }, e.status);
      console.error(e);
      return json(req, { status: 'error', reason: 'internal_error' }, 500);
    }
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/** pg_cron/pg_net calls carry x-lihim-cron = CRON_SECRET (see migrations/*_schedules.sql). */
export function assertCron(req: Request): void {
  const got = req.headers.get('x-lihim-cron') ?? '';
  if (!got || !timingSafeEqual(got, env('CRON_SECRET'))) throw new HttpError(403, 'forbidden');
}

export async function readJson<T>(req: Request): Promise<T> {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'invalid', 'body must be JSON');
  }
}
