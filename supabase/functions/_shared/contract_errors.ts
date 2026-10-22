// Contract error codes (contracts/INTERFACE.md §8). Codes are unique across
// the three contracts, so a code can be named without knowing which one raised it.
// In RPC simulation/submission output they appear as `Error(Contract, #208)`.

export const CONTRACT_ERRORS: Readonly<Record<number, string>> = {
  // LihimSemaphore
  100: 'GroupNotFound',
  101: 'LeafOutOfField',
  102: 'LeafIsZero',
  103: 'LeafExists',
  104: 'LeafNotFound',
  105: 'WrongSiblingNodes',
  106: 'EmptyBatch',
  107: 'BatchTooLarge',
  108: 'DepthNotSupported',
  109: 'DepthTooSmall',
  110: 'GroupHasNoMembers',
  111: 'RootNotInGroup',
  112: 'RootExpired',
  113: 'NullifierUsed',
  114: 'InvalidProof',
  115: 'MalformedProof',
  116: 'FieldOutOfRange',
  // LihimPolls
  200: 'PollNotFound',
  201: 'TooFewMembers',
  202: 'InvalidKind',
  203: 'InvalidCloseTime',
  204: 'PollClosed',
  205: 'WrongRoot',
  206: 'WrongScope',
  207: 'ChoiceOutOfRange',
  208: 'AlreadyVoted',
  209: 'NotYetClosable',
  210: 'AlreadyClosed',
  // LihimVerifier
  300: 'Finalized',
  301: 'DepthNotSupported',
  302: 'VkNotSet',
  303: 'MalformedVk',
  304: 'MissingVks',
  305: 'MalformedInput',
};

export type HostFailure =
  /** A `#[contracterror]` code. */
  | { kind: 'contract'; code: number; name: string }
  /**
   * The admin Ed25519 signature did not verify (`Error(Crypto, InvalidInput)`):
   * wrong nonce, a create_group whose predicted group id was taken, or a forgery.
   */
  | { kind: 'signature' }
  /** Missing/invalid Soroban auth (`Error(Auth, ...)`). */
  | { kind: 'auth' }
  /** Some other host error (budget, storage, archived entry, ...). */
  | { kind: 'host'; detail: string }
  /** No host error in the message: RPC/network trouble, not a contract verdict. */
  | { kind: 'unknown' };

// TODO(M0): confirm the exact Crypto/Auth strings on testnet (INTERFACE.md §8).
export function classifyFailure(e: unknown): HostFailure {
  const msg = e instanceof Error ? e.message : String(e);
  const contract = msg.match(/Error\(Contract, #(\d+)\)/);
  if (contract) {
    const code = Number(contract[1]);
    return { kind: 'contract', code, name: CONTRACT_ERRORS[code] ?? 'Unknown' };
  }
  if (/Error\(Crypto,/.test(msg)) return { kind: 'signature' };
  if (/Error\(Auth,/.test(msg)) return { kind: 'auth' };
  const host = msg.match(/Error\((\w+), (\w+)\)/);
  if (host) return { kind: 'host', detail: `${host[1]}:${host[2]}` };
  return { kind: 'unknown' };
}

/** Short reason safe to return to clients (never echoes raw host diagnostics). */
export function failureReason(f: HostFailure): string {
  switch (f.kind) {
    case 'contract':
      return `${f.name} (#${f.code})`;
    case 'signature':
      return 'admin signature did not verify';
    case 'auth':
      return 'authorization failed';
    case 'host':
      return `host error ${f.detail}`;
    case 'unknown':
      return 'simulation_failed';
  }
}
