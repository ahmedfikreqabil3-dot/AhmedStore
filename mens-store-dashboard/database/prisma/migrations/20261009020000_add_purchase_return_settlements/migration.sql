CREATE TABLE "PurchaseReturnSettlement" (
  "id" TEXT NOT NULL,
  "purchaseReturnId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "paymentMethod" "PaymentMethod",
  "amount" DECIMAL(19,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseReturnSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseReturnSettlement_purchaseReturnId_fkey" FOREIGN KEY ("purchaseReturnId") REFERENCES "PurchaseReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PurchaseReturnSettlement_purchaseReturnId_kind_idx" ON "PurchaseReturnSettlement"("purchaseReturnId", "kind");
