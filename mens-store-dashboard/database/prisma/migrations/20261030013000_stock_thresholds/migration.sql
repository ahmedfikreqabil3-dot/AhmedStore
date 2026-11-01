BEGIN;
CREATE TABLE "StockThreshold" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "minimum" DECIMAL(19,4) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockThreshold_nonnegative_minimum" CHECK ("minimum" >= 0),
  CONSTRAINT "StockThreshold_positive_version" CHECK ("version" > 0),
  CONSTRAINT "StockThreshold_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockThreshold_organizationId_productId_fkey" FOREIGN KEY ("organizationId","productId") REFERENCES "Product"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockThreshold_organizationId_warehouseId_fkey" FOREIGN KEY ("organizationId","warehouseId") REFERENCES "Warehouse"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StockThreshold_organizationId_warehouseId_productId_key" ON "StockThreshold"("organizationId","warehouseId","productId");
CREATE INDEX "StockThreshold_organizationId_productId_idx" ON "StockThreshold"("organizationId","productId");
COMMIT;
