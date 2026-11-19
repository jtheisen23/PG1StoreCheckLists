-- CreateEnum
CREATE TYPE "SubSize" AS ENUM ('MINI', 'REGULAR', 'GIANT');

-- AlterEnum
ALTER TYPE "ItemType" ADD VALUE 'SUB_WEIGHT';

-- CreateTable
CREATE TABLE "SubSpec" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" "SubSize" NOT NULL,
    "specOz" DOUBLE PRECISION,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubSpec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubWeighing" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "subSpecId" TEXT NOT NULL,
    "weightOz" DOUBLE PRECISION NOT NULL,
    "specOz" DOUBLE PRECISION,

    CONSTRAINT "SubWeighing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubSpec_orgId_idx" ON "SubSpec"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "SubSpec_orgId_number_size_key" ON "SubSpec"("orgId", "number", "size");

-- CreateIndex
CREATE UNIQUE INDEX "SubWeighing_responseId_key" ON "SubWeighing"("responseId");

-- CreateIndex
CREATE INDEX "SubWeighing_subSpecId_idx" ON "SubWeighing"("subSpecId");

-- AddForeignKey
ALTER TABLE "SubSpec" ADD CONSTRAINT "SubSpec_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubWeighing" ADD CONSTRAINT "SubWeighing_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "ItemResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubWeighing" ADD CONSTRAINT "SubWeighing_subSpecId_fkey" FOREIGN KEY ("subSpecId") REFERENCES "SubSpec"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
