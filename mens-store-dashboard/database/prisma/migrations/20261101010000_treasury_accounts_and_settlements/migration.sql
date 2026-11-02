BEGIN;

-- AlterTable
ALTER TABLE "TreasuryTransaction" ADD COLUMN     "accountId" TEXT;

-- CreateTable
CREATE TABLE "TreasuryAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createKey" TEXT,
    "commandHash" CHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "commandHash" CHAR(64) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasuryTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartySettlement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "accountId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "commandHash" CHAR(64) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartySettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementAllocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "saleId" TEXT,
    "purchaseId" TEXT,
    "amount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "SettlementAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TreasuryAccount_organizationId_active_idx" ON "TreasuryAccount"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryAccount_org_id_key" ON "TreasuryAccount"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryAccount_organizationId_name_key" ON "TreasuryAccount"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryAccount_organizationId_createKey_key" ON "TreasuryAccount"("organizationId", "createKey");

-- CreateIndex
CREATE INDEX "TreasuryTransfer_organizationId_occurredAt_idx" ON "TreasuryTransfer"("organizationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryTransfer_organizationId_idempotencyKey_key" ON "TreasuryTransfer"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PartySettlement_organizationId_kind_occurredAt_idx" ON "PartySettlement"("organizationId", "kind", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartySettlement_org_id_key" ON "PartySettlement"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PartySettlement_organizationId_idempotencyKey_key" ON "PartySettlement"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SettlementAllocation_organizationId_saleId_idx" ON "SettlementAllocation"("organizationId", "saleId");

-- CreateIndex
CREATE INDEX "SettlementAllocation_organizationId_purchaseId_idx" ON "SettlementAllocation"("organizationId", "purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementAllocation_settlementId_saleId_key" ON "SettlementAllocation"("settlementId", "saleId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementAllocation_settlementId_purchaseId_key" ON "SettlementAllocation"("settlementId", "purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_org_id_key" ON "Supplier"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_org_id_key" ON "Sale"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_org_id_key" ON "Purchase"("organizationId", "id");

-- CreateIndex
CREATE INDEX "TreasuryTransaction_organizationId_accountId_occurredAt_id_idx" ON "TreasuryTransaction"("organizationId", "accountId", "occurredAt", "id");

-- AddForeignKey
ALTER TABLE "TreasuryTransaction" ADD CONSTRAINT "TreasuryTransaction_organizationId_accountId_fkey" FOREIGN KEY ("organizationId", "accountId") REFERENCES "TreasuryAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryAccount" ADD CONSTRAINT "TreasuryAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryTransfer" ADD CONSTRAINT "TreasuryTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryTransfer" ADD CONSTRAINT "TreasuryTransfer_organizationId_fromAccountId_fkey" FOREIGN KEY ("organizationId", "fromAccountId") REFERENCES "TreasuryAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryTransfer" ADD CONSTRAINT "TreasuryTransfer_organizationId_toAccountId_fkey" FOREIGN KEY ("organizationId", "toAccountId") REFERENCES "TreasuryAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartySettlement" ADD CONSTRAINT "PartySettlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartySettlement" ADD CONSTRAINT "PartySettlement_organizationId_customerId_fkey" FOREIGN KEY ("organizationId", "customerId") REFERENCES "Customer"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartySettlement" ADD CONSTRAINT "PartySettlement_organizationId_supplierId_fkey" FOREIGN KEY ("organizationId", "supplierId") REFERENCES "Supplier"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartySettlement" ADD CONSTRAINT "PartySettlement_organizationId_accountId_fkey" FOREIGN KEY ("organizationId", "accountId") REFERENCES "TreasuryAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementAllocation" ADD CONSTRAINT "SettlementAllocation_organizationId_settlementId_fkey" FOREIGN KEY ("organizationId", "settlementId") REFERENCES "PartySettlement"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementAllocation" ADD CONSTRAINT "SettlementAllocation_organizationId_saleId_fkey" FOREIGN KEY ("organizationId", "saleId") REFERENCES "Sale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementAllocation" ADD CONSTRAINT "SettlementAllocation_organizationId_purchaseId_fkey" FOREIGN KEY ("organizationId", "purchaseId") REFERENCES "Purchase"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "TreasuryAccount_one_default_method" ON "TreasuryAccount"("organizationId","paymentMethod") WHERE "isDefault";
ALTER TABLE "TreasuryAccount" ADD CONSTRAINT "TreasuryAccount_method_check" CHECK ("paymentMethod"<>'CREDIT' AND version>0);
ALTER TABLE "TreasuryTransfer" ADD CONSTRAINT "TreasuryTransfer_valid_check" CHECK (amount>0 AND "fromAccountId"<>"toAccountId" AND length(trim(reason)) BETWEEN 3 AND 500);
ALTER TABLE "PartySettlement" ADD CONSTRAINT "PartySettlement_valid_check" CHECK (amount>0 AND length(trim(reason)) BETWEEN 3 AND 500 AND ((kind='customers' AND "customerId" IS NOT NULL AND "supplierId" IS NULL) OR (kind='suppliers' AND "supplierId" IS NOT NULL AND "customerId" IS NULL)));
ALTER TABLE "SettlementAllocation" ADD CONSTRAINT "SettlementAllocation_valid_check" CHECK (amount>0 AND (("saleId" IS NOT NULL AND "purchaseId" IS NULL) OR ("purchaseId" IS NOT NULL AND "saleId" IS NULL)));
ALTER TABLE "TreasuryTransfer" ADD CONSTRAINT "TreasuryTransfer_actor_tenant_fkey" FOREIGN KEY ("organizationId","actorUserId") REFERENCES "User"("organizationId",id) ON DELETE RESTRICT;
ALTER TABLE "PartySettlement" ADD CONSTRAINT "PartySettlement_actor_tenant_fkey" FOREIGN KEY ("organizationId","actorUserId") REFERENCES "User"("organizationId",id) ON DELETE RESTRICT;
ALTER TABLE "CustomerLedgerEntry" DROP CONSTRAINT "CustomerLedgerEntry_kind_sign_check";
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_kind_sign_check" CHECK (
 (type='SALE_CREDIT' AND "sourceType"='Sale' AND amount>0) OR
 (type='RETURN_CREDIT' AND "sourceType"='SalesReturn' AND amount<0) OR
 (type='RETURN_REVERSAL' AND "sourceType"='SalesReturn' AND amount>0) OR
 (type='CUSTOMER_COLLECTION' AND "sourceType"='PartySettlement' AND amount<0)
);

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "TreasuryTransaction" WHERE "paymentMethod"='CREDIT') THEN
   RAISE EXCEPTION 'Treasury account migration requires reconciliation of credit-method treasury entries';
 END IF;
END $$;
INSERT INTO "TreasuryAccount" (id,"organizationId",name,"paymentMethod","isDefault",active,version,"createdAt","updatedAt")
 SELECT gen_random_uuid()::text,o.id,'الخزينة الافتراضية - '||m.method,m.method::"PaymentMethod",true,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
 FROM "Organization" o CROSS JOIN (VALUES ('CASH'),('CARD'),('WALLET'),('INSTAPAY')) m(method);
UPDATE "TreasuryTransaction" t SET "accountId"=a.id FROM "TreasuryAccount" a
 WHERE a."organizationId"=t."organizationId" AND a."paymentMethod"=t."paymentMethod" AND a."isDefault";
ALTER TABLE "TreasuryTransaction" ADD CONSTRAINT "TreasuryTransaction_account_required" CHECK ("accountId" IS NOT NULL);
CREATE UNIQUE INDEX "TreasuryTransaction_controlled_source_key" ON "TreasuryTransaction"("organizationId",type,"sourceType","sourceId")
 WHERE type IN ('CUSTOMER_COLLECTION','SUPPLIER_SETTLEMENT','ACCOUNT_TRANSFER_IN','ACCOUNT_TRANSFER_OUT','ACCOUNT_OPENING');

CREATE FUNCTION assign_treasury_account() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE chosen "TreasuryAccount"%ROWTYPE;
BEGIN
 IF NEW."paymentMethod"='CREDIT' THEN RAISE EXCEPTION 'Credit is not a treasury payment method' USING ERRCODE='23514'; END IF;
 IF NEW."accountId" IS NULL THEN
   INSERT INTO "TreasuryAccount" (id,"organizationId",name,"paymentMethod","isDefault",active,version,"createdAt","updatedAt")
   VALUES (gen_random_uuid()::text,NEW."organizationId",'الخزينة الافتراضية - '||NEW."paymentMethod"::text,NEW."paymentMethod",true,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
   ON CONFLICT ("organizationId","paymentMethod") WHERE "isDefault" DO NOTHING;
   SELECT * INTO chosen FROM "TreasuryAccount" WHERE "organizationId"=NEW."organizationId" AND "paymentMethod"=NEW."paymentMethod" AND "isDefault";
   NEW."accountId"=chosen.id;
 ELSE
   SELECT * INTO chosen FROM "TreasuryAccount" WHERE "organizationId"=NEW."organizationId" AND id=NEW."accountId";
 END IF;
 IF chosen.id IS NULL OR NOT chosen.active OR chosen."paymentMethod"<>NEW."paymentMethod" THEN
   RAISE EXCEPTION 'Treasury account is unavailable or does not match the payment method' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "TreasuryTransaction_assign_account" BEFORE INSERT ON "TreasuryTransaction" FOR EACH ROW EXECUTE FUNCTION assign_treasury_account();
COMMIT;
