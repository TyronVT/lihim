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
