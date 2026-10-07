-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('PENDING_APPROVAL', 'POSTED', 'VOIDED');

-- CreateTable
CREATE TABLE "SalesReturn" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "saleId" TEXT,
    "customerId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "reason" TEXT NOT NULL,
    "total" DECIMAL(19,4) NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'POSTED',
    "idempotencyKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnLine" (
    "id" TEXT NOT NULL,
    "salesReturnId" TEXT NOT NULL,
    "saleLineId" TEXT,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "total" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "ReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnPayment" (
    "id" TEXT NOT NULL,
    "salesReturnId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesReturn_organizationId_saleId_occurredAt_idx" ON "SalesReturn"("organizationId", "saleId", "occurredAt");

-- CreateIndex
CREATE INDEX "SalesReturn_organizationId_status_occurredAt_idx" ON "SalesReturn"("organizationId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "SalesReturn_organizationId_warehouseId_occurredAt_idx" ON "SalesReturn"("organizationId", "warehouseId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SalesReturn_organizationId_idempotencyKey_key" ON "SalesReturn"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ReturnLine_saleLineId_idx" ON "ReturnLine"("saleLineId");

-- CreateIndex
CREATE INDEX "ReturnLine_productId_idx" ON "ReturnLine"("productId");

-- CreateIndex
CREATE INDEX "ReturnPayment_salesReturnId_method_idx" ON "ReturnPayment"("salesReturnId", "method");

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "SaleLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnPayment" ADD CONSTRAINT "ReturnPayment_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
