-- Flag Labor Code managerial employees, who fall outside PD 851
-- 13th-month coverage (rank-and-file only). Existing rows default to
-- rank-and-file.
ALTER TABLE "Employee" ADD COLUMN "isManagerial" BOOLEAN NOT NULL DEFAULT false;
