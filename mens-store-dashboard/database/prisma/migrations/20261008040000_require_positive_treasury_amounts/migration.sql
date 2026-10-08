ALTER TABLE "TreasuryTransaction"
  ADD CONSTRAINT "TreasuryTransaction_amount_positive" CHECK ("amount" > 0);
