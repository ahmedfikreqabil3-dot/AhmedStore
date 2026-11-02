-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TreasuryTransactionType" ADD VALUE 'CUSTOMER_COLLECTION';
ALTER TYPE "TreasuryTransactionType" ADD VALUE 'SUPPLIER_SETTLEMENT';
ALTER TYPE "TreasuryTransactionType" ADD VALUE 'ACCOUNT_TRANSFER_IN';
ALTER TYPE "TreasuryTransactionType" ADD VALUE 'ACCOUNT_TRANSFER_OUT';
ALTER TYPE "TreasuryTransactionType" ADD VALUE 'ACCOUNT_OPENING';

