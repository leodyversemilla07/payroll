-- Hot-path read indexes for tenant-scoped payroll workflows.
-- Covers organization/employee lookups, loan and leave ledgers,
-- DTR date ordering, payslip reporting windows, and bank batches.
CREATE INDEX "Branch_organizationId_idx"
ON "Branch"("organizationId");

CREATE INDEX "Department_organizationId_idx"
ON "Department"("organizationId");

CREATE INDEX "Employee_organizationId_idx"
ON "Employee"("organizationId");

CREATE INDEX "EmployeeAllowance_employeeId_idx"
ON "EmployeeAllowance"("employeeId");

CREATE INDEX "DailyTimeRecord_date_idx"
ON "DailyTimeRecord"("date");

CREATE INDEX "OvertimeRequest_employeeId_idx"
ON "OvertimeRequest"("employeeId");

CREATE INDEX "LeaveRequest_employeeId_idx"
ON "LeaveRequest"("employeeId");

CREATE INDEX "EmployeeLoan_employeeId_idx"
ON "EmployeeLoan"("employeeId");

CREATE INDEX "LoanPayment_loanId_idx"
ON "LoanPayment"("loanId");

CREATE INDEX "Payslip_employeeId_idx"
ON "Payslip"("employeeId");

CREATE INDEX "Payslip_createdAt_idx"
ON "Payslip"("createdAt");

CREATE INDEX "BankTransmittalBatch_payrollRunId_idx"
ON "BankTransmittalBatch"("payrollRunId");
