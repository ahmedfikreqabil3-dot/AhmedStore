BEGIN;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_organizationId_userId_fkey" FOREIGN KEY ("organizationId","userId") REFERENCES "User"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Shift_one_open_per_owner" ON "Shift"("organizationId","userId") WHERE "status"='OPEN';
COMMIT;
