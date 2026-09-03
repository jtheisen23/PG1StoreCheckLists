-- DropForeignKey
ALTER TABLE "CorrectiveAction" DROP CONSTRAINT "CorrectiveAction_locationId_fkey";

-- DropForeignKey
ALTER TABLE "Submission" DROP CONSTRAINT "Submission_locationId_fkey";

-- DropForeignKey
ALTER TABLE "TemplateItem" DROP CONSTRAINT "TemplateItem_sectionId_fkey";

-- DropForeignKey
ALTER TABLE "TemplateSection" DROP CONSTRAINT "TemplateSection_templateId_fkey";

-- AddForeignKey
ALTER TABLE "TemplateSection" ADD CONSTRAINT "TemplateSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateItem" ADD CONSTRAINT "TemplateItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TemplateSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

