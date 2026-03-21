# Features Backlog

## Credit Card Intelligence & Utilization Tracking
*   **Description:** Enhance Ledger to track credit card limits, utilization, and interest velocity. Integrate these as high-fidelity inputs for Atlas's `financialFriction` metric to enable predictive burnout alerts and stress-spending detection.
*   **Module Impact:** `Ledger` (data schema, transaction logic) and `Atlas` (predictive state machine, crisis thresholds).
*   **Integration Point:** Update `computeFinancialFriction` in `resonance-roi-service.ts`.
