ALTER TYPE "ShiftStatus" ADD VALUE IF NOT EXISTS 'REVIEWED';

ALTER TABLE "Shift"
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByUserId" TEXT;

CREATE INDEX "Shift_organizationId_status_closedAt_idx"
  ON "Shift"("organizationId", "status", "closedAt");

CREATE UNIQUE INDEX "Shift_one_open_per_user"
  ON "Shift"("organizationId", "userId")
  WHERE "status" = 'OPEN';
