BEGIN;
CREATE UNIQUE INDEX "User_org_id_key" ON "User"("organizationId","id");
CREATE UNIQUE INDEX "Product_org_id_key" ON "Product"("organizationId","id");
CREATE UNIQUE INDEX "Warehouse_org_id_key" ON "Warehouse"("organizationId","id");
ALTER TABLE "InventoryTransfer"
  DROP CONSTRAINT "InventoryTransfer_productId_fkey",
  DROP CONSTRAINT "InventoryTransfer_sourceWarehouseId_fkey",
  DROP CONSTRAINT "InventoryTransfer_destinationWarehouseId_fkey",
  DROP CONSTRAINT "InventoryTransfer_actorUserId_fkey";
ALTER TABLE "InventoryTransfer"
  ADD CONSTRAINT "InventoryTransfer_productId_fkey" FOREIGN KEY ("organizationId","productId") REFERENCES "Product"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransfer_sourceWarehouseId_fkey" FOREIGN KEY ("organizationId","sourceWarehouseId") REFERENCES "Warehouse"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransfer_destinationWarehouseId_fkey" FOREIGN KEY ("organizationId","destinationWarehouseId") REFERENCES "Warehouse"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryTransfer_actorUserId_fkey" FOREIGN KEY ("organizationId","actorUserId") REFERENCES "User"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
