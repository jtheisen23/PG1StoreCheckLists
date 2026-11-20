-- AlterTable
ALTER TABLE "TemplateSection" ADD COLUMN     "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
