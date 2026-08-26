# PowerHouse App — Deep Functionality Audit

Date: 2026-08-26
Scope: functionality review only; no existing feature/file intentionally removed.

## Findings

### 1. High priority — fuel calculation needs business-rule verification
`frontend/src/FuelManagement.jsx` currently derives hourly fuel from rated KVA using fixed interpolation points of 5%, 10%, 16%, and 20% of rated KVA, then multiplies by runtime. KWh is used to infer load percentage. This is a software-consistent formula, but it must be verified against the actual generator OEM/load/fuel tables before being treated as production fuel accounting.

### 2. High priority — Firestore access is broader than ideal
Current rules allow any signed-in user to read/write `tasks`, `activities`, and `duties`, and any signed-in user can create/update/delete `entries`. Admin UI restrictions therefore are not the only security boundary. Server-side/Firestore authorization should eventually enforce ownership/role rules at the data layer.

### 3. Medium priority — Firebase offline persistence is not enabled
`firebase.js` uses `getFirestore(app)` only. A search for `persistentLocalCache` returned no result. Therefore Firestore persistence/offline sync is not currently configured through that API.

### 4. Medium priority — authentication state has dual sources
`auth.js` uses a localStorage `user` object as the application session while Firebase Auth persistence is also configured. `App.jsx` determines auth from `getToken()`. This can create stale-session edge cases if Firebase Auth state and localStorage diverge.

### 5. Medium priority — live listeners can become expensive
Fuel management subscribes to the full `entries`, `engineServiceLogs`, and `wapdaReadings` collections with `onSnapshot`. This is correct for realtime behavior but can become expensive as historical data grows. Date/limit/query strategy should be introduced without losing realtime updates.

### 6. Medium priority — duplicate fuel-management modules exist
The repository contains both `frontend/src/FuelManagement.jsx` and `frontend/src/pages/FuelManagement.jsx`, plus `PublicFuelManagement.jsx`. The active route currently imports `./FuelManagement`. This is not a deletion recommendation; the duplicate should be mapped before any cleanup.

### 7. PWA/notifications
A dedicated `powerhouse-sw.js` is registered for messaging, and old Firebase messaging worker registrations are cleaned up. This is structurally good. The current build also generates Firebase worker configuration.

## Recommended next implementation order
1. Verify generator fuel curves against actual OEM/load tables.
2. Harden Firestore authorization without breaking current roles.
3. Add safe Firestore offline persistence and conflict handling.
4. Reconcile Firebase Auth state with the local application session.
5. Optimize realtime listeners with bounded queries/aggregation.
6. Map duplicate modules and dead/compatibility routes before any cleanup.
7. Run production build/browser verification after each batch.

## No-delete rule
No existing project feature should be removed merely because it looks duplicated or legacy. First establish all imports/routes/data dependencies, then refactor safely with rollback available.
