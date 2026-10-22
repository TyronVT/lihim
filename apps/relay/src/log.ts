// The relay's only logger. It accepts exactly four fields and copies them by
// name, so a careless call site cannot leak a header, IP or user agent: there
// is simply nowhere to put one. Do not replace this with a generic logger or
// Hono's logger middleware (which prints request lines).

export type VoteLogEntry = {
  poll_id?: string;
  nullifier?: string;
  tx_hash?: string;
  outcome: string;
};

export type LogSink = (line: string) => void;
export type VoteLogger = (entry: VoteLogEntry) => void;

export function createLogger(sink: LogSink = (line) => process.stdout.write(line + "\n")): VoteLogger {
  return (entry) => {
    const safe: VoteLogEntry = { outcome: String(entry.outcome) };
    if (entry.poll_id !== undefined) safe.poll_id = String(entry.poll_id);
    if (entry.nullifier !== undefined) safe.nullifier = String(entry.nullifier);
    if (entry.tx_hash !== undefined) safe.tx_hash = String(entry.tx_hash);
    sink(JSON.stringify(safe));
  };
}
