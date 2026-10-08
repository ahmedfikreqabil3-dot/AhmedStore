ALTER TABLE "Shift"
  ADD COLUMN "expectedCash" DECIMAL(19,4),
  ADD COLUMN "countedCash" DECIMAL(19,4),
  ADD COLUMN "cashDifference" DECIMAL(19,4),
  ADD COLUMN "discrepancyReason" TEXT;
