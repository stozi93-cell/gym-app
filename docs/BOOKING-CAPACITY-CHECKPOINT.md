# Booking Capacity Checkpoint

Status on 2026-09-11: implementation and emulator tests are saved; NOT DEPLOYED.
The urgent live invoice correction took priority. No capacity functions or capacity
frontend have been published. The existing redesign preview still has the earlier
15:30 afternoon split, not this dynamic-capacity change.

## Intended Rules

- Standard slot capacity remains four, preserving explicit manual capacities.
- Each pair of half-hour-adjacent slots on the same Belgrade calendar day allows six
  client bookings in total. Both the previous and next slot constrain availability.
- Count actual booking documents across duplicate physical slots for one occurrence.
- Cancellations restore available places immediately. Never remove existing bookings.
- Admin override remains unrestricted, with visible over-capacity warnings.

## Saved Implementation

- Shared pure calculations: `functions/bookings/capacity.mjs`.
- A per-day `bookingCapacityDays` transaction document serializes adjacent-slot bookings.
- `bookSlotPreview` is a separate callable name for preview isolation. Development mode
  and `.env.preview` select it. Production still calls `bookSlot`.
- The shared handler source changes both exported callables, but deployment can and
  should initially target ONLY `functions:bookSlotPreview`.
- Client/admin availability follows realtime booking snapshots.
- Old capacity guard cleanup is included in source, not deployed.

IMPORTANT: Until `bookSlotPreview` is deployed, local development bookings against
that endpoint will fail. The live app still uses the unchanged deployed `bookSlot`.
Mixed live/preview booking traffic does not gain the full shared-guard guarantee until
both callable deployments use the new handler. Existing live bookings remain real data
in a Firebase Hosting preview; never casually test with real client accounts.

## Verification Completed

- Seven pure test cases, including all 729 combinations of neighbor counts from 0 to 8.
- Nine isolated Firestore emulator cases: concurrent materialization, adjacent races,
  both neighbors, cancellation races, legacy duplicates, admin override, gaps,
  capacities, one-per-day guards and invalid client override flags.
- Preview build passed. Calendar browser interaction checks and preview deployment
  remain outstanding.

```powershell
npm run test:capacity
npm run test:capacity:integration
npm run build:preview
```

Integration tests require Java 21. The portable runtime installed for this checkout is
`C:\Users\stozi\AppData\Local\gym-booking-tools\java21-20260911-195220\jdk-21.0.12.1+1-jre`.
Set `JAVA_HOME` and prepend its `bin` folder to the command session's PATH. Tests require
`demo-gym-capacity` and `127.0.0.1:8188`; they do not write production data.

## Next Steps

Review the calendar UI and handler changes, deploy only the preview callable, rebuild
with `npm run build:preview`, and publish only the `redesign-preview` hosting channel.
Then have the owner test before any live booking backend changes. Do not deploy all
functions as part of the unrelated invoice hotfix.
