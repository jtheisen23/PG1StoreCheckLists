-- CreateTable
CREATE TABLE "CloseArea" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "templateId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloseArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloseRating" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "closeDate" DATE NOT NULL,
    "acceptable" BOOLEAN NOT NULL,
    "note" TEXT,
    "ratedById" TEXT NOT NULL,
    "closingSubmissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CloseRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CloseArea_orgId_idx" ON "CloseArea"("orgId");

-- CreateIndex
CREATE INDEX "CloseRating_orgId_closeDate_idx" ON "CloseRating"("orgId", "closeDate");

-- CreateIndex
CREATE INDEX "CloseRating_locationId_closeDate_idx" ON "CloseRating"("locationId", "closeDate");

-- CreateIndex
CREATE UNIQUE INDEX "CloseRating_locationId_areaId_closeDate_key" ON "CloseRating"("locationId", "areaId", "closeDate");

-- AddForeignKey
ALTER TABLE "CloseArea" ADD CONSTRAINT "CloseArea_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseArea" ADD CONSTRAINT "CloseArea_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseRating" ADD CONSTRAINT "CloseRating_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseRating" ADD CONSTRAINT "CloseRating_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseRating" ADD CONSTRAINT "CloseRating_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "CloseArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseRating" ADD CONSTRAINT "CloseRating_ratedById_fkey" FOREIGN KEY ("ratedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseRating" ADD CONSTRAINT "CloseRating_closingSubmissionId_fkey" FOREIGN KEY ("closingSubmissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
