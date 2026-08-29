-- AlterTable
ALTER TABLE "FixedExpense" ADD COLUMN "sourceKey" TEXT;

-- CreateTable
CREATE TABLE "RecurringDismissal" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "dismissedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "FixedExpense_sourceKey_key" ON "FixedExpense"("sourceKey");
