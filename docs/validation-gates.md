# Payroll release gates — NOT cleared for live payroll

This is a verification checklist, **not** legal, tax, or bank-format approval. The generated 2316-inspired text is an **internal reconciliation worksheet**, not BIR Form 2316. The `compliance.listYearEndReconciliations` API returns a read-only, tenant-scoped review queue for employees with disbursed payslips paid in the specified year; `BLOCKED_REVIEW` rows have null financial figures and must not be treated as zero. Its `classified*` totals exclude blocked employees and are **not filing totals**. The `compliance.previewBir2316Reconciliation` API returns recorded ledger withholding and an *unsettled* difference; neither procedure posts a refund, collects a deficiency, or verifies a remittance. `BALANCED` means only that the two computed amounts match, not that the employee is qualified for substituted filing or that a certificate can be issued. Years before 2023 are rejected because this preview only implements the 2023-onwards annual tax table.

## Primary references inspected

- [BIR RR 11-2018, §2.79(B)(5)(b)](https://bir-cdn.bir.gov.ph/local/pdf/Digest%20RR%2011-2018.pdf): annualized year-end and termination tax, prior employers, final-pay deduction and refund timing. The 2023-onwards annual table is in this regulation; its [Annex E](https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf) is the periodic withholding table.
- [BIR Form 2316 (September 2021 ENCS)](https://bir-cdn.bir.gov.ph/local/pdf/2316%20Sep%202021%20ENCS_Final_corrected.pdf) and [BIR's forms page](https://www.bir.gov.ph/bir-forms?tab=Certificates&idTag=BIR2316&datasetCode=3381&label=2316&type=TAB%20LINK): the actual form's summary is items **19–28**, not the formerly printed worksheet lines 25–32. The form has previous-employer fields, tax credits and signatures that our ledger does not capture. The forms page describes issuance by January 31 or on termination; verify latest form/version and applicable regulations before issuing.
- [RR 11-2018 §2.83.4](https://bir-cdn.bir.gov.ph/local/pdf/Digest%20RR%2011-2018.pdf): substituted filing requires only one employer and correctly withheld tax. Matching calculated tax and payslip withholding alone cannot prove eligibility.

## Required reconciliation before BIR 2316 or 1604-C

- [ ] Independently sign off 2026 rules/thresholds (including later amendments), classification of de minimis, statutory contribution rates, benefits and minimum-wage earnings, and unit fixtures from a tax professional. Unit tests validate arithmetic against the cited table; they are **not** independent regulatory approval.
- [ ] Persist/verify previous-employer compensation and withholding (if any), tax credits, and payroll-period remittances; reconcile monthly 1601-C, annual 1604-C and every employee's adjusted withholding. Do not infer remittance from a payslip.
- [ ] Implement an auditable December/termination settlement: post deficiency withholding or paid refund to the ledger, handle negative/insufficient last pay and the legally required timing. Recompute after settlement; do not certify a computed-but-unpaid refund.
- [ ] Validate actual BIR 2316 field mapping against the current official form and tax-preparer-reviewed examples; add an issuance workflow and proper access/audit controls. The current preview is not that form.
- [ ] Reconcile 13th-month taxable excess, shared ₱90,000 bucket, MWE taxable extras and de minimis excess; current service deliberately blocks uncertain classifications.

## Bank-file gate (separate from tax)

- [ ] Obtain **current, bank-supplied** file layouts and a test/sandbox upload process for each bank, product, account type and settlement channel. The existing CSV headers are illustrative only, **not verified bank specifications**.
- [ ] Compare sample outputs against each bank's official layout: encoding, account format, field order/width, header/trailer and control totals, decimal handling, rejection feedback, cutoff timing and duplicate-file behavior.
- [ ] Test with non-production/test accounts under bank approval; reconcile acknowledged transfers and rejected rows against approved payroll. Keep live file delivery disabled until written confirmation from each bank.
