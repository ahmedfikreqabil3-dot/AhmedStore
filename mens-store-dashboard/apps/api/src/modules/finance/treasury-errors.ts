export class TreasuryError extends Error {
  readonly statusCode = 409;
  constructor(readonly reason: 'ACTOR_UNAVAILABLE' | 'ACCOUNT_UNAVAILABLE' | 'INSUFFICIENT_FUNDS' | 'PARTY_UNAVAILABLE' | 'AMOUNT_EXCEEDS_DEBT' | 'INVALID_ALLOCATION' | 'IDEMPOTENCY_KEY_CONFLICT' | 'ACCOUNT_NAME_EXISTS') { super(reason); }
}
