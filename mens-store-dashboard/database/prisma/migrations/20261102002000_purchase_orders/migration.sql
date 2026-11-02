CREATE TABLE "PurchaseOrder" (
 "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
 "actorUserId" TEXT NOT NULL,"supplierId" TEXT NOT NULL,"warehouseId" TEXT NOT NULL,"supplierName" TEXT NOT NULL,"warehouseName" TEXT NOT NULL,
 "lines" JSONB NOT NULL CHECK(jsonb_typeof("lines")='array' AND jsonb_array_length("lines") BETWEEN 1 AND 100),
 "total" DECIMAL(19,4) NOT NULL CHECK("total">0),"status" TEXT NOT NULL DEFAULT 'OPEN' CHECK("status" IN ('OPEN','PARTIAL','RECEIVED','CANCELLED')),
 "version" INTEGER NOT NULL DEFAULT 1 CHECK("version">0),"idempotencyKey" TEXT NOT NULL,"requestHash" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE("organizationId","id"),UNIQUE("organizationId","idempotencyKey"),
 FOREIGN KEY("organizationId","actorUserId") REFERENCES "User"("organizationId","id") ON DELETE RESTRICT,
 FOREIGN KEY("organizationId","supplierId") REFERENCES "Supplier"("organizationId","id") ON DELETE RESTRICT,
 FOREIGN KEY("organizationId","warehouseId") REFERENCES "Warehouse"("organizationId","id") ON DELETE RESTRICT
);
CREATE INDEX "PurchaseOrder_organizationId_warehouseId_status_createdAt_idx" ON "PurchaseOrder"("organizationId","warehouseId","status","createdAt");
CREATE INDEX "PurchaseOrder_organizationId_actorUserId_idx" ON "PurchaseOrder"("organizationId","actorUserId");
CREATE INDEX "PurchaseOrder_organizationId_supplierId_idx" ON "PurchaseOrder"("organizationId","supplierId");
CREATE TABLE "OrderReceipt" (
 "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,"orderId" TEXT NOT NULL,
 "purchaseId" TEXT NOT NULL UNIQUE,"lines" JSONB NOT NULL CHECK(jsonb_typeof("lines")='array' AND jsonb_array_length("lines")>0),
 "total" DECIMAL(19,4) NOT NULL CHECK("total">0),"idempotencyKey" TEXT NOT NULL,"requestHash" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("organizationId","purchaseId"),UNIQUE("organizationId","idempotencyKey"),
 FOREIGN KEY("organizationId","orderId") REFERENCES "PurchaseOrder"("organizationId","id") ON DELETE RESTRICT,
 FOREIGN KEY("organizationId","purchaseId") REFERENCES "Purchase"("organizationId","id") ON DELETE RESTRICT
);
CREATE INDEX "OrderReceipt_organizationId_orderId_idx" ON "OrderReceipt"("organizationId","orderId");
