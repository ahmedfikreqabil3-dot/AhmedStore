ALTER TABLE "InventoryTransaction"
  ADD CONSTRAINT "InventoryTransaction_quantity_nonzero"
  CHECK ("quantity" <> 0);
