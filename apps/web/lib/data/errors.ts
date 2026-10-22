/** Typed failures the repository can reject with. Screens branch on `instanceof`. */

export class ForbiddenError extends Error {
  constructor(message = "Admin only") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class InviteError extends Error {
  constructor(message = "Invite expired or used up") {
    super(message);
    this.name = "InviteError";
  }
}

export class SmallGroupError extends Error {
  constructor(
    public readonly memberCount: number,
    public readonly minMembers: number,
  ) {
    super(`Group has ${memberCount} members; polls need at least ${minMembers}`);
    this.name = "SmallGroupError";
  }
}

/**
 * Passkey prompt failures (L0 sign in, L2 join). Screens map them to copy.signin.*:
 * - PasskeyCancelledError   → the user dismissed the prompt (WebAuthn NotAllowedError). Nothing happened.
 * - PasskeyNotFoundError    → a passkey answered that this Lihim doesn't know ("No Lihim passkey on this device").
 * - PasskeyUnsupportedError → no WebAuthn, or the passkey can't do PRF, so answers can't be kept private
 *                             on this browser (the recovery-code fallback is still open, M0).
 */
export class PasskeyCancelledError extends Error {
  constructor(message = "Passkey prompt dismissed") {
    super(message);
    this.name = "PasskeyCancelledError";
  }
}

export class PasskeyNotFoundError extends Error {
  constructor(message = "No Lihim account for this passkey") {
    super(message);
    this.name = "PasskeyNotFoundError";
  }
}

export class PasskeyUnsupportedError extends Error {
  constructor(message = "WebAuthn or the PRF extension is unavailable") {
    super(message);
    this.name = "PasskeyUnsupportedError";
  }
}

/** retryPoll: the draft's closing time has passed, so it can't be re-sent as is. Discard it and make a new poll. */
export class PollClosingPassedError extends Error {
  constructor(message = "The poll's closing time has passed") {
    super(message);
    this.name = "PollClosingPassedError";
  }
}
