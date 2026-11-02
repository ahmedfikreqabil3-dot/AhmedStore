BEGIN;
ALTER TABLE "CustomerLedgerEntry" DROP CONSTRAINT "CustomerLedgerEntry_kind_sign_check";
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_kind_sign_check" CHECK (
 (type='SALE_CREDIT' AND "sourceType"='Sale' AND amount>0) OR
 (type='RETURN_CREDIT' AND "sourceType"='SalesReturn' AND amount<0) OR
 (type='RETURN_REVERSAL' AND "sourceType"='SalesReturn' AND amount>0) OR
 (type='CUSTOMER_COLLECTION' AND "sourceType"='PartySettlement' AND amount<0) OR
 (type='OPENING_BALANCE' AND "sourceType"='MigrationBatch' AND amount<>0)
);
ALTER TABLE "DataImport" DROP CONSTRAINT "DataImport_kind_check";
ALTER TABLE "DataImport" ADD CONSTRAINT "DataImport_kind_check" CHECK (kind IN ('CUSTOMERS','OPENING_CUTOVER'));
ALTER TABLE "DataImport" DROP CONSTRAINT "DataImport_importedCount_check";
ALTER TABLE "DataImport" ADD CONSTRAINT "DataImport_importedCount_check" CHECK (
 (kind='CUSTOMERS' AND "importedCount">0 AND "importedCount"<=1000) OR
 (kind='OPENING_CUTOVER' AND "importedCount">=0 AND "importedCount"<=100000)
);
COMMIT;
