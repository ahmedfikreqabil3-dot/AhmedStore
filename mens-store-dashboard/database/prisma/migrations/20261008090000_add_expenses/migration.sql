ALTER TYPE "TreasuryTransactionType" ADD VALUE IF NOT EXISTS 'EXPENSE_PAYMENT';

CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Expense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Expense_organizationId_idempotencyKey_key" ON "Expense"("organizationId", "idempotencyKey");
CREATE INDEX "Expense_organizationId_occurredAt_idx" ON "Expense"("organizationId", "occurredAt");
