// Rate limiting by proof validity, not by user (spec: "Vote relay"). The relay
// never looks at who is calling, so the only thing it can count is how many
// invalid votes a poll has attracted. Invalid ones cost an RPC simulation but
// no fee; past the threshold the relay stops simulating for that poll until
// the window rolls over.
//
// Trade-off: a spammer can briefly lock a poll out of the relay. That beats
// keying on IP, which would mean holding IPs. If it happens in practice, add
// the small proof-of-work token the spec mentions.

export type InvalidVoteLimiter = {
  isBlocked(pollId: bigint): boolean;
  recordInvalid(pollId: bigint): void;
};

const MAX_TRACKED_POLLS = 10_000;

export function createInvalidVoteLimiter(
  limitPerWindow: number,
  windowMs = 60_000,
  now: () => number = Date.now,
): InvalidVoteLimiter {
  const windows = new Map<bigint, { start: number; count: number }>();

  const current = (pollId: bigint) => {
    const w = windows.get(pollId);
    if (!w || now() - w.start >= windowMs) return undefined;
    return w;
  };

  return {
    // A limit of 0 disables the limiter.
    isBlocked: (pollId) => limitPerWindow > 0 && (current(pollId)?.count ?? 0) >= limitPerWindow,
    recordInvalid(pollId) {
      const w = current(pollId);
      if (w) {
        w.count++;
        return;
      }
      if (windows.size >= MAX_TRACKED_POLLS) {
        for (const [id, v] of windows) if (now() - v.start >= windowMs) windows.delete(id);
        // Still full of live windows: drop the oldest rather than grow unbounded.
        if (windows.size >= MAX_TRACKED_POLLS) windows.delete(windows.keys().next().value!);
      }
      windows.set(pollId, { start: now(), count: 1 });
    },
  };
}
