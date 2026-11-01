BEGIN;
-- Reject ambiguous historical reversals rather than invent their time/actor.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Sale" s JOIN "SalePayment" p ON p."saleId"=s.id WHERE s.status='VOIDED' AND p.method='CREDIT' AND p.amount>0)
  OR EXISTS (SELECT 1 FROM "SalesReturn" r JOIN "ReturnPayment" p ON p."salesReturnId"=r.id WHERE r.status='VOIDED' AND p.method='CREDIT' AND p.amount>0 AND NOT EXISTS (SELECT 1 FROM "SalesReturn" n WHERE n."replacesReturnId"=r.id))
  THEN RAISE EXCEPTION 'Customer credit migration requires reconciliation of unlinked legacy reversals'; END IF;
END $$;

CREATE UNIQUE INDEX "Customer_org_id_key" ON "Customer"("organizationId",id);
CREATE TABLE "CustomerLedgerEntry" (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
  "customerId" TEXT NOT NULL,
  type TEXT NOT NULL,
  amount DECIMAL(19,4) NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerLedgerEntry_customer_tenant_fkey" FOREIGN KEY ("organizationId","customerId") REFERENCES "Customer"("organizationId",id) ON DELETE RESTRICT,
  CONSTRAINT "CustomerLedgerEntry_actor_tenant_fkey" FOREIGN KEY ("organizationId","actorUserId") REFERENCES "User"("organizationId",id) ON DELETE RESTRICT,
  CONSTRAINT "CustomerLedgerEntry_kind_sign_check" CHECK (
    (type='SALE_CREDIT' AND "sourceType"='Sale' AND amount>0) OR
    (type='RETURN_CREDIT' AND "sourceType"='SalesReturn' AND amount<0) OR
    (type='RETURN_REVERSAL' AND "sourceType"='SalesReturn' AND amount>0)
  )
);
CREATE UNIQUE INDEX "CustomerLedgerEntry_organizationId_type_sourceType_sourceId_key" ON "CustomerLedgerEntry"("organizationId",type,"sourceType","sourceId");
CREATE INDEX "CustomerLedgerEntry_organizationId_customerId_occurredAt_id_idx" ON "CustomerLedgerEntry"("organizationId","customerId","occurredAt",id);

INSERT INTO "CustomerLedgerEntry" (id,"organizationId","customerId",type,amount,"sourceType","sourceId","actorUserId","occurredAt")
SELECT 'credit-sale-'||s.id,s."organizationId",s."customerId",'SALE_CREDIT',SUM(p.amount),'Sale',s.id,s."actorUserId",s."occurredAt"
FROM "Sale" s JOIN "SalePayment" p ON p."saleId"=s.id
WHERE s.status='POSTED' AND p.method='CREDIT' GROUP BY s.id HAVING SUM(p.amount)>0;

INSERT INTO "CustomerLedgerEntry" (id,"organizationId","customerId",type,amount,"sourceType","sourceId","actorUserId","occurredAt")
SELECT 'credit-return-'||r.id,r."organizationId",r."customerId",'RETURN_CREDIT',-SUM(p.amount),'SalesReturn',r.id,COALESCE(r."approvedByUserId",r."actorUserId"),r."occurredAt"
FROM "SalesReturn" r JOIN "ReturnPayment" p ON p."salesReturnId"=r.id
WHERE r.status IN ('POSTED','VOIDED') AND p.method='CREDIT' GROUP BY r.id HAVING SUM(p.amount)>0;

INSERT INTO "CustomerLedgerEntry" (id,"organizationId","customerId",type,amount,"sourceType","sourceId","actorUserId","occurredAt")
SELECT 'credit-reversal-'||r.id,r."organizationId",r."customerId",'RETURN_REVERSAL',SUM(p.amount),'SalesReturn',r.id,n."actorUserId",n."occurredAt"
FROM "SalesReturn" r JOIN "ReturnPayment" p ON p."salesReturnId"=r.id JOIN "SalesReturn" n ON n."replacesReturnId"=r.id AND n."organizationId"=r."organizationId"
WHERE r.status='VOIDED' AND p.method='CREDIT' GROUP BY r.id,n.id HAVING SUM(p.amount)>0;
COMMIT;
