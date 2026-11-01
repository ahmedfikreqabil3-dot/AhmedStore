ALTER TABLE "AuditEvent" ADD COLUMN "details" JSONB, ADD COLUMN "requestId" TEXT;

CREATE TABLE "InventoryTransfer" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sourceWarehouseId" TEXT NOT NULL,
  "destinationWarehouseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "reason" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryTransfer_positive_quantity" CHECK ("quantity" > 0),
  CONSTRAINT "InventoryTransfer_distinct_warehouses" CHECK ("sourceWarehouseId" <> "destinationWarehouseId"),
  CONSTRAINT "InventoryTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryTransfer_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryTransfer_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryTransfer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryTransfer_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryTransfer_organizationId_idempotencyKey_key" ON "InventoryTransfer"("organizationId","idempotencyKey");
CREATE INDEX "InventoryTransfer_organizationId_occurredAt_idx" ON "InventoryTransfer"("organizationId","occurredAt");
CREATE INDEX "InventoryTransfer_org_source_occurred_idx" ON "InventoryTransfer"("organizationId","sourceWarehouseId","occurredAt");
CREATE INDEX "InventoryTransfer_org_destination_occurred_idx" ON "InventoryTransfer"("organizationId","destinationWarehouseId","occurredAt");
CREATE INDEX "InventoryTransfer_org_product_occurred_idx" ON "InventoryTransfer"("organizationId","productId","occurredAt");
