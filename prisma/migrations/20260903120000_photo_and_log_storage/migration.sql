-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_pathname_key" ON "StoredFile"("pathname");

-- CreateIndex
CREATE INDEX "StoredFile_orgId_createdAt_idx" ON "StoredFile"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_orgId_action_createdAt_idx" ON "ActivityLog"("orgId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_orgId_locationId_createdAt_idx" ON "ActivityLog"("orgId", "locationId", "createdAt");

