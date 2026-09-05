-- Prevent duplicate payroll execution for the same tenant and cutoff.
CREATE UNIQUE INDEX "PayrollRun_organization_cutoff_key"
ON "PayrollRun"("organizationId", "cutoffStartDate", "cutoffEndDate", "cutoffSequence");

-- Support tenant-scoped payroll workflow and payment-date queries.
CREATE INDEX "PayrollRun_organizationId_status_idx"
ON "PayrollRun"("organizationId", "status");

CREATE INDEX "PayrollRun_organizationId_paymentDate_idx"
ON "PayrollRun"("organizationId", "paymentDate");
