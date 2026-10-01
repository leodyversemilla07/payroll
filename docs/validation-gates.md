# Payroll release gates — NOT cleared for live payroll

This is a verification checklist, **not** legal, tax, or bank-format approval. Implemented workflows and passing tests do not constitute independent regulatory validation. Do not use Payroll for live payroll or treat its worksheet/snapshot as a validated official BIR Form 2316.

## Implemented development capabilities (not release approval)

- `compliance.listYearEndReconciliations` returns a read-only, tenant-scoped review queue for employees with disbursed payslips paid in the selected year (2023–2100). `BLOCKED_REVIEW` rows have null financial figures, not zero. Classified totals exclude blocked employees and are **not filing totals**.
- Prior-employer declarations, transcribed income, and monthly remittance references are recorded with actor/time provenance. Entered amounts and references are **self-reported, unverified**, not proof of filing, remittance, or document authenticity. Missing/conflicting evidence and missing/mismatched remittance amounts block reconciliation.
- Previous-employer taxable income and withholding are incorporated in annualization with present-employer payroll. Prior amounts are taken as transcribed, not reclassified. Minimum-wage earners with prior taxable income remain blocked for manual review.
- Evidence and settlement corrections append higher-version records with a reason and a different reviewer; readers use the latest version per key. This supersession history is not durable source-document storage or proof of an independent document review.
- `compliance.recordYearEndSettlement` records an attestation of deficiency withheld/refund paid with disbursed payroll. Active employees settle with December pay; separated employees settle with termination-month pay. Deficiencies above the month's disbursed net pay are rejected. Reconciliation recomputes remaining balances after later payments/evidence changes. This record does not transfer money or independently verify the stated payment.
- `compliance.issueBir2316` records an HR-controlled, versioned issuance snapshot after a conclusive, fully settled reconciliation. Void/re-issue preserves history and the deadline is informational. The snapshot/worksheet is **not a validated official form**, filing acknowledgment, or substituted-filing eligibility verdict.

- Leave management reads recorded balances without granting default credits, files explicit requests, and atomically audits paid approval/debit or pending rejection. Self-approval, overlapping approvals and processed regular cutoffs are blocked. Recorded credits (including legacy defaults), leave eligibility, holiday treatment and nonstandard schedules still require independent policy/statutory verification; this workflow does not provision or certify entitlements.

## Primary references inspected

- [BIR RR 11-2018, §2.79(B)(5)(b)](https://bir-cdn.bir.gov.ph/local/pdf/Digest%20RR%2011-2018.pdf): annualized year-end and termination tax, prior employers, final-pay deduction and refund timing. The 2023-onwards annual table is in this regulation; its [Annex E](https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf) is the periodic withholding table.
- [BIR Form 2316 (September 2021 ENCS)](https://bir-cdn.bir.gov.ph/local/pdf/2316%20Sep%202021%20ENCS_Final_corrected.pdf) and [BIR's forms page](https://www.bir.gov.ph/bir-forms?tab=Certificates&idTag=BIR2316&datasetCode=3381&label=2316&type=TAB%20LINK): the actual form's summary is items **19–28**, not the formerly printed worksheet lines 25–32. Previous-employer fields, tax credits, signatures, and the full official layout require validation. The forms page describes issuance by January 31 or on termination; verify the latest form/version and applicable regulations before issuing.
- [RR 11-2018 §2.83.4](https://bir-cdn.bir.gov.ph/local/pdf/Digest%20RR%2011-2018.pdf): substituted filing requires only one employer and correctly withheld tax. Matching calculated tax and payslip withholding alone cannot prove eligibility.

## Required reconciliation before BIR 2316 or 1604-C

All release gates below remain **open**:

- [ ] Independently sign off 2026 rules/thresholds (including later amendments), de minimis classification, statutory contribution rates, benefits/minimum-wage earnings, and tax fixtures with a tax professional. Unit tests validate arithmetic, not regulatory approval.
- [ ] Verify recorded leave credits and their provenance, statutory/company eligibility, supported work schedules, public holidays, half-day treatment and paid-leave/DTR reconciliation. Reading or approving a recorded balance is not proof of entitlement; legacy default allocations must not be treated as independently verified.
- [ ] Verify previous-employer 2316 figures, monthly remittance references, and no-previous-employer declarations against source documents/BIR acknowledgments. Validate prior-employer annualization and all applicable tax credits. Reconcile monthly 1601-C, annual 1604-C, and each employee's adjusted withholding; do not infer remittance from payslips or entered references.
- [ ] Add access-controlled, durable source-document storage and verify the correction/reviewer workflow against supporting evidence. A reference string and a different reviewer ID are not themselves document verification.
- [ ] Independently reconcile recorded settlements against actual withholding/refund payments. Validate December/termination timing, insufficient final pay, follow-up collection/refund handling, and later evidence corrections; do not certify a computed-but-unpaid refund.
- [ ] Validate the current official BIR 2316 field mapping, tax credits, signatures, and tax-preparer-reviewed examples. Review snapshot issuance, void/re-issue, stale-evidence handling, access, and audit controls before issuing any official form. No substituted-filing eligibility is inferred.
- [ ] Reconcile 13th-month taxable excess, the shared ₱90,000 bucket, MWE taxable extras, and de minimis excess. Uncertain classifications remain blocked for manual review.

## Bank-file gate (separate from tax)

- [ ] Obtain **current, bank-supplied** file layouts and a test/sandbox upload process for each bank, product, account type, and settlement channel. Existing CSV headers are illustrative, **not verified bank specifications**.
- [ ] Compare sample outputs against official encoding, account formats, field order/width, header/trailer and control totals, decimal handling, rejection feedback, cutoff timing, and duplicate-file behavior.
- [ ] Test with non-production accounts under bank approval; reconcile acknowledged transfers and rejected rows against approved payroll. Keep live delivery disabled until written confirmation from each bank.
