CREATE TABLE "SaleDraft" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
 "actorUserId" TEXT NOT NULL, "customerId" TEXT NOT NULL, "warehouseId" TEXT NOT NULL,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('QUOTATION','HELD')),
 "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','CANCELLED','CONVERTED')),
 "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version">0),
 "customerName" TEXT NOT NULL,"warehouseName" TEXT NOT NULL,"lines" JSONB NOT NULL CHECK (jsonb_typeof("lines")='array' AND jsonb_array_length("lines") BETWEEN 1 AND 100),
 "subtotal" DECIMAL(19,4) NOT NULL CHECK ("subtotal">=0),"discount" DECIMAL(19,4) NOT NULL CHECK ("discount">=0),"total" DECIMAL(19,4) NOT NULL CHECK ("total">0 AND "total"="subtotal"-"discount"),
 "saleId" TEXT UNIQUE,"idempotencyKey" TEXT NOT NULL,"requestHash" TEXT NOT NULL,"conversionKey" TEXT NOT NULL UNIQUE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK (("status"='CONVERTED')=("saleId" IS NOT NULL)),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "User"("organizationId","id") ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","customerId") REFERENCES "Customer"("organizationId","id") ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","warehouseId") REFERENCES "Warehouse"("organizationId","id") ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","saleId") REFERENCES "Sale"("organizationId","id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "SaleDraft_organizationId_idempotencyKey_key" ON "SaleDraft"("organizationId","idempotencyKey");
CREATE INDEX "SaleDraft_organizationId_kind_status_createdAt_idx" ON "SaleDraft"("organizationId","kind","status","createdAt");
CREATE INDEX "SaleDraft_organizationId_actorUserId_createdAt_idx" ON "SaleDraft"("organizationId","actorUserId","createdAt");
CREATE INDEX "SaleDraft_organizationId_customerId_idx" ON "SaleDraft"("organizationId","customerId");
CREATE INDEX "SaleDraft_organizationId_warehouseId_idx" ON "SaleDraft"("organizationId","warehouseId");
CREATE UNIQUE INDEX "SaleDraft_organizationId_saleId_key" ON "SaleDraft"("organizationId","saleId");
