# Invoice Correction Hotfix

## Release Boundary

- Live source baseline: `cc51681` (verified against the served JavaScript; only CRLF escape differences).
- Previous hosting release: `sites/gym-booking-a75f8/releases/1781122980614000`.
- Previous hosting version: `sites/gym-booking-a75f8/versions/2499132ad00b5d5c`.
- Previous app version: `2026-06-10.2`.
- Hotfix app version: `2026-09-11.billing-1`.
- Separate worktree: `C:\Users\stozi\Desktop\gym-booking-live-billing`.
- Branch: `codex-live-billing-fix`.
- Deploy hosting only. Do not include redesign, capacity functions, Storage rules, or Firestore rules.

## Behavior

Admins can edit an individual invoice's price and recorded paid amount in Naplate,
including fully paid invoices. Resetting a mistaken payment sets the paid amount to
zero and clears its active payment date. A price-only correction retains an existing
payment date. Fully paid, partially paid and pending statuses follow the two amounts.
Cancelled invoices stay cancelled. No global package prices, subscriptions, attendance
records or membership links change. There is no money transfer or refund operation.

Each new correction, payment or cancellation appends before/after financial values,
the actor and a timestamp to `billing.adjustmentHistory` in the same transaction as
the change. Existing historical payments are not reconstructed, but their current
values are captured before the first change. No audit entries are trimmed.

Transactions reject stale edits using financial fields and `billingRevision`.
Clients still running the old app do not use the new transaction handler; refresh
admin sessions before making corrections. No production invoice is edited by deployment.

## Verification

```powershell
node --test tests/invoice-values.test.mjs
firebase emulators:exec --project demo-gym-billing --only firestore --config tests/firebase.billing.json "node --test tests/billing.integration.mjs"
npx eslint src/pages/AdminBilling.jsx src/components/InvoiceEditor.jsx src/billing/*.mjs
npm run build
```

The integration tests require Java 21 and explicitly refuse non-demo projects or a
non-loopback Firestore emulator. Test rules are local-only and must never be deployed.
`tests/billing-preview.html` is a local-only editor fixture; Vite's production build
does not include it. Use it for phone/desktop layout and form interaction checks.

## Rollback

Before publishing, preserve the current live hosting version in the
`billing-backup-20260911` preview channel. To restore that exact frontend:

```powershell
firebase hosting:clone gym-booking-a75f8:billing-backup-20260911 gym-booking-a75f8:live --project gym-booking-a75f8
```

Hosting rollback does not undo invoice corrections. Their before/after values remain
in Firestore and can be reviewed before any explicit data restoration. Keep the saved
version ID above if the temporary backup channel later expires.
