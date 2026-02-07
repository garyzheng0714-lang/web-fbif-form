CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SubmissionRole" AS ENUM ('INDUSTRY', 'CONSUMER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SubmissionIdType" AS ENUM ('CN_ID', 'PASSPORT', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Submission" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "role" "SubmissionRole" NOT NULL DEFAULT 'CONSUMER',
  "name" VARCHAR(64) NOT NULL,
  "title" VARCHAR(64) NOT NULL,
  "company" VARCHAR(128) NOT NULL,
  "idType" "SubmissionIdType" NOT NULL DEFAULT 'CN_ID',
  "phoneEnc" TEXT NOT NULL,
  "phoneHash" VARCHAR(64) NOT NULL,
  "idEnc" TEXT NOT NULL,
  "idHash" VARCHAR(64) NOT NULL,
  "businessType" VARCHAR(64),
  "department" VARCHAR(64),
  "proofFilesJson" TEXT,
  "statusTokenHash" VARCHAR(64) NOT NULL DEFAULT md5(random()::text),
  "idempotencyKeyHash" VARCHAR(64),
  "source" VARCHAR(32) NOT NULL DEFAULT 'web',
  "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
  "syncError" TEXT,
  "feishuRecordId" VARCHAR(64),
  "clientIp" VARCHAR(64),
  "userAgent" VARCHAR(256),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Submission"
  ADD COLUMN IF NOT EXISTS "role" "SubmissionRole" DEFAULT 'CONSUMER',
  ADD COLUMN IF NOT EXISTS "idType" "SubmissionIdType" DEFAULT 'CN_ID',
  ADD COLUMN IF NOT EXISTS "businessType" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "department" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "proofFilesJson" TEXT,
  ADD COLUMN IF NOT EXISTS "statusTokenHash" VARCHAR(64) DEFAULT md5(random()::text),
  ADD COLUMN IF NOT EXISTS "idempotencyKeyHash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "source" VARCHAR(32) DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

UPDATE "Submission" SET "role" = 'CONSUMER' WHERE "role" IS NULL;
UPDATE "Submission" SET "idType" = 'CN_ID' WHERE "idType" IS NULL;
UPDATE "Submission" SET "statusTokenHash" = md5(random()::text) WHERE "statusTokenHash" IS NULL OR "statusTokenHash" = '';
UPDATE "Submission" SET "source" = 'web' WHERE "source" IS NULL OR "source" = '';

ALTER TABLE "Submission"
  ALTER COLUMN "role" SET NOT NULL,
  ALTER COLUMN "idType" SET NOT NULL,
  ALTER COLUMN "statusTokenHash" SET NOT NULL,
  ALTER COLUMN "source" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Submission_phoneHash_idx" ON "Submission"("phoneHash");
CREATE INDEX IF NOT EXISTS "Submission_idHash_idx" ON "Submission"("idHash");
CREATE INDEX IF NOT EXISTS "Submission_syncStatus_idx" ON "Submission"("syncStatus");
CREATE INDEX IF NOT EXISTS "Submission_statusTokenHash_idx" ON "Submission"("statusTokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "Submission_idempotencyKeyHash_key" ON "Submission"("idempotencyKeyHash");
CREATE INDEX IF NOT EXISTS "Submission_createdAt_idx" ON "Submission"("createdAt");
