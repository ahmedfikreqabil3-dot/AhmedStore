BEGIN;
CREATE UNIQUE INDEX "InventoryTransaction_org_id_key" ON "InventoryTransaction"("organizationId","id");
CREATE TABLE "StockCount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockCount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCount_organizationId_warehouseId_fkey" FOREIGN KEY ("organizationId","warehouseId") REFERENCES "Warehouse"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCount_organizationId_actorUserId_fkey" FOREIGN KEY ("organizationId","actorUserId") REFERENCES "User"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StockCount_organizationId_id_key" ON "StockCount"("organizationId","id");
CREATE UNIQUE INDEX "StockCount_organizationId_idempotencyKey_key" ON "StockCount"("organizationId","idempotencyKey");
CREATE INDEX "StockCount_organizationId_occurredAt_id_idx" ON "StockCount"("organizationId","occurredAt","id");
CREATE TABLE "StockCountLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "stockCountId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "expectedQuantity" DECIMAL(19,4) NOT NULL,
  "countedQuantity" DECIMAL(19,4) NOT NULL,
  "difference" DECIMAL(19,4) NOT NULL,
  "inventoryTransactionId" TEXT,
  CONSTRAINT "StockCountLine_nonnegative_count" CHECK ("countedQuantity" >= 0),
  CONSTRAINT "StockCountLine_exact_difference" CHECK ("difference" = "countedQuantity" - "expectedQuantity"),
  CONSTRAINT "StockCountLine_adjustment_link" CHECK (("difference" = 0 AND "inventoryTransactionId" IS NULL) OR ("difference" <> 0 AND "inventoryTransactionId" IS NOT NULL)),
  CONSTRAINT "StockCountLine_organizationId_stockCountId_fkey" FOREIGN KEY ("organizationId","stockCountId") REFERENCES "StockCount"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountLine_organizationId_productId_fkey" FOREIGN KEY ("organizationId","productId") REFERENCES "Product"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountLine_organizationId_inventoryTransactionId_fkey" FOREIGN KEY ("organizationId","inventoryTransactionId") REFERENCES "InventoryTransaction"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StockCountLine_organizationId_stockCountId_productId_key" ON "StockCountLine"("organizationId","stockCountId","productId");
CREATE UNIQUE INDEX "StockCountLine_organizationId_inventoryTransactionId_key" ON "StockCountLine"("organizationId","inventoryTransactionId");
COMMIT;
