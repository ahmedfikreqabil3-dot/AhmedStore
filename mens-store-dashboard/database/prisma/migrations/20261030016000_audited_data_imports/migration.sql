BEGIN;
CREATE TABLE "DataImport" (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
  "actorUserId" TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind='CUSTOMERS'),
  "idempotencyKey" VARCHAR(200) NOT NULL CHECK (length("idempotencyKey")>0),
  "contentHash" CHAR(64) NOT NULL CHECK ("contentHash" ~ '^[0-9a-f]{64}$'),
  "importedCount" INTEGER NOT NULL CHECK ("importedCount">0 AND "importedCount"<=1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataImport_actor_tenant_fkey" FOREIGN KEY ("organizationId","actorUserId") REFERENCES "User"("organizationId",id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "DataImport_org_kind_key_key" ON "DataImport"("organizationId",kind,"idempotencyKey");
CREATE INDEX "DataImport_org_created_idx" ON "DataImport"("organizationId","createdAt",id);
COMMIT;
