-- CreateEnum
CREATE TYPE "TreasuryTransactionType" AS ENUM ('SALE_RECEIPT', 'RETURN_REFUND');

-- CreateTable
CREATE TABLE "TreasuryTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "TreasuryTransactionType" NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasuryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TreasuryTransaction_organizationId_occurredAt_paymentMethod_idx" ON "TreasuryTransaction"("organizationId", "occurredAt", "paymentMethod");

-- CreateIndex
CREATE INDEX "TreasuryTransaction_organizationId_sourceType_sourceId_idx" ON "TreasuryTransaction"("organizationId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "TreasuryTransaction" ADD CONSTRAINT "TreasuryTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
