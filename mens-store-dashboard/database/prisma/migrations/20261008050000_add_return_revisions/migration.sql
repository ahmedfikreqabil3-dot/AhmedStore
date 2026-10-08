ALTER TYPE "TreasuryTransactionType" ADD VALUE IF NOT EXISTS 'RETURN_REFUND_REVERSAL';

ALTER TABLE "SalesReturn" ADD COLUMN "replacesReturnId" TEXT;

CREATE INDEX "SalesReturn_organizationId_replacesReturnId_idx" ON "SalesReturn"("organizationId", "replacesReturnId");

ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_replacesReturnId_fkey" FOREIGN KEY ("replacesReturnId") REFERENCES "SalesReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
