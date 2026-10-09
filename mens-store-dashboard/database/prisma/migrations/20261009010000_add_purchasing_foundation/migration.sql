CREATE TYPE "PurchaseStatus" AS ENUM ('POSTED', 'VOIDED');
CREATE TYPE "SupplierLedgerEntryType" AS ENUM ('PURCHASE_CREDIT', 'PURCHASE_RETURN_CREDIT', 'SUPPLIER_PAYMENT', 'REVERSAL');

ALTER TYPE "TreasuryTransactionType" ADD VALUE IF NOT EXISTS 'PURCHASE_PAYMENT';
ALTER TYPE "TreasuryTransactionType" ADD VALUE IF NOT EXISTS 'PURCHASE_PAYMENT_REVERSAL';
ALTER TYPE "TreasuryTransactionType" ADD VALUE IF NOT EXISTS 'PURCHASE_RETURN_REFUND';

CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Supplier_organizationId_name_key" ON "Supplier"("organizationId", "name");
CREATE INDEX "Supplier_organizationId_active_name_idx" ON "Supplier"("organizationId", "active", "name");

CREATE TABLE "Purchase" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "subtotal" DECIMAL(19,4) NOT NULL,
  "total" DECIMAL(19,4) NOT NULL,
  "status" "PurchaseStatus" NOT NULL DEFAULT 'POSTED',
  "replacesPurchaseId" TEXT,
  "idempotencyKey" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Purchase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Purchase_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Purchase_replacesPurchaseId_fkey" FOREIGN KEY ("replacesPurchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Purchase_organizationId_idempotencyKey_key" ON "Purchase"("organizationId", "idempotencyKey");
CREATE INDEX "Purchase_organizationId_supplierId_occurredAt_idx" ON "Purchase"("organizationId", "supplierId", "occurredAt");
CREATE INDEX "Purchase_organizationId_warehouseId_occurredAt_idx" ON "Purchase"("organizationId", "warehouseId", "occurredAt");
CREATE INDEX "Purchase_organizationId_replacesPurchaseId_idx" ON "Purchase"("organizationId", "replacesPurchaseId");

CREATE TABLE "PurchaseLine" (
  "id" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "barcode" TEXT,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unitCost" DECIMAL(19,4) NOT NULL,
  "total" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "PurchaseLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PurchaseLine_purchaseId_lineNumber_key" ON "PurchaseLine"("purchaseId", "lineNumber");
CREATE INDEX "PurchaseLine_productId_idx" ON "PurchaseLine"("productId");

CREATE TABLE "PurchasePayment" (
  "id" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchasePayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchasePayment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PurchasePayment_purchaseId_method_idx" ON "PurchasePayment"("purchaseId", "method");

CREATE TABLE "PurchaseReturn" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "total" DECIMAL(19,4) NOT NULL,
  "status" "PurchaseStatus" NOT NULL DEFAULT 'POSTED',
  "idempotencyKey" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseReturn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReturn_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReturn_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PurchaseReturn_organizationId_idempotencyKey_key" ON "PurchaseReturn"("organizationId", "idempotencyKey");
CREATE INDEX "PurchaseReturn_organizationId_purchaseId_occurredAt_idx" ON "PurchaseReturn"("organizationId", "purchaseId", "occurredAt");
CREATE INDEX "PurchaseReturn_organizationId_supplierId_occurredAt_idx" ON "PurchaseReturn"("organizationId", "supplierId", "occurredAt");
CREATE INDEX "PurchaseReturn_organizationId_warehouseId_occurredAt_idx" ON "PurchaseReturn"("organizationId", "warehouseId", "occurredAt");

CREATE TABLE "PurchaseReturnLine" (
  "id" TEXT NOT NULL,
  "purchaseReturnId" TEXT NOT NULL,
  "purchaseLineId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unitCost" DECIMAL(19,4) NOT NULL,
  "total" DECIMAL(19,4) NOT NULL,
  CONSTRAINT "PurchaseReturnLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseReturnLine_purchaseReturnId_fkey" FOREIGN KEY ("purchaseReturnId") REFERENCES "PurchaseReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReturnLine_purchaseLineId_fkey" FOREIGN KEY ("purchaseLineId") REFERENCES "PurchaseLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReturnLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PurchaseReturnLine_purchaseLineId_idx" ON "PurchaseReturnLine"("purchaseLineId");
CREATE INDEX "PurchaseReturnLine_productId_idx" ON "PurchaseReturnLine"("productId");

CREATE TABLE "SupplierLedgerEntry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "type" "SupplierLedgerEntryType" NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierLedgerEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierLedgerEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SupplierLedgerEntry_organizationId_supplierId_occurredAt_idx" ON "SupplierLedgerEntry"("organizationId", "supplierId", "occurredAt");
CREATE INDEX "SupplierLedgerEntry_organizationId_sourceType_sourceId_idx" ON "SupplierLedgerEntry"("organizationId", "sourceType", "sourceId");
