-- DropForeignKey
ALTER TABLE "ItemResponse" DROP CONSTRAINT "ItemResponse_itemId_fkey";

-- AlterTable
ALTER TABLE "TemplateItem" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "ItemResponse" ADD CONSTRAINT "ItemResponse_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TemplateItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

