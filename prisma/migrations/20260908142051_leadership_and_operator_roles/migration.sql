-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'PRESIDENT';
ALTER TYPE "Role" ADD VALUE 'VICE_PRESIDENT';
ALTER TYPE "Role" ADD VALUE 'DIRECTOR_OF_OPS';
ALTER TYPE "Role" ADD VALUE 'OPERATOR';
