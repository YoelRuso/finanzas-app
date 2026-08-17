-- AlterTable
ALTER TABLE "Account" ADD COLUMN "alias" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AiAdvice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "month" TEXT NOT NULL,
    "accountScope" TEXT NOT NULL DEFAULT 'all',
    "content" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AiAdvice" ("content", "createdAt", "dataHash", "id", "model", "month", "updatedAt") SELECT "content", "createdAt", "dataHash", "id", "model", "month", "updatedAt" FROM "AiAdvice";
DROP TABLE "AiAdvice";
ALTER TABLE "new_AiAdvice" RENAME TO "AiAdvice";
CREATE UNIQUE INDEX "AiAdvice_month_accountScope_key" ON "AiAdvice"("month", "accountScope");
CREATE TABLE "new_Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entryReference" TEXT,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "creditDebit" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "category" TEXT,
    "categoryManual" BOOLEAN NOT NULL DEFAULT false,
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "transferPairId" INTEGER,
    "transferManual" BOOLEAN NOT NULL DEFAULT false,
    "accountId" TEXT NOT NULL,
    "rawData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("accountId", "amount", "category", "categoryManual", "createdAt", "creditDebit", "currency", "date", "description", "entryReference", "id", "rawData", "updatedAt") SELECT "accountId", "amount", "category", "categoryManual", "createdAt", "creditDebit", "currency", "date", "description", "entryReference", "id", "rawData", "updatedAt" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_entryReference_key" ON "Transaction"("entryReference");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
