# Production release blockers — Powerhouse

This repository includes compatibility-sensitive task documents, legacy task attachments and public file links. **Do not merge or deploy the draft security PR until the following are checked in staging.**

## Mandatory evidence
- [ ] CI frontend, backend and both Firebase Emulator suites pass against the exact release commit.
- [ ] Export/backup Firestore, Storage and any MySQL/Railway data; verify a restore sample.
- [ ] Test user workflows with admin, superadmin, electrician, CRO, inactive user and public visitor accounts.
- [ ] Inventory all legacy numeric task assignee IDs; migrate to Firebase UID with audited mapping before enforcing per-assignee rules.
- [ ] Verify create, assign, accept, reject, complete, reassign, delete and report download for tasks.
- [ ] Verify duty mark/shift, WAPDA reading, fuel ledger, engine service record, diesel alerts and reports.
- [ ] Review all Firebase Storage paths against actual uploads. Existing download URLs containing Firebase tokens may remain usable independently of new rules; revoke tokens and migrate to authorized file delivery for private documents.
- [ ] Migrate CVs, voice notes and attachments out of publicly tracked `backend/uploads` to private storage; verify links before any delete. Classify machine images as public/private.
- [ ] After archival and migration, coordinate a dedicated repository-history cleanup; notify collaborators and rotate any exposed credentials. `.gitignore` does not remove historical blobs.
- [ ] Enable `PRIVATE_UPLOADS_ENABLED` only after every image/link/preview/download client supports authenticated access.
- [ ] Test notification registration, Socket.IO, MCP, offline/mobile page state and Firebase push.
- [ ] Deploy to staging and run end-to-end smoke tests, then roll out with monitoring/rollback documented.

## Known restrictions / incomplete hardening
- `entries`, `engineServiceLogs`, `wapdaReadings`, `activities`, `duties` and `system_counters` have broad signed-in write permissions. Converting them directly to admin-only without a role matrix would break current non-admin clients.
- Task creation remains authenticated-user wide. Task workflow updates are restricted by Firebase UID assignment, but legacy numeric assignment compatibility needs verification.
- Upload controls include filename/MIME checks; full content inspection, malware scanning, upload quotas and per-task storage ACL are not implemented.
- Existing frontend authentication still uses client-cached profile data for some route decisions. Server-side rules remain the security boundary.
- Tests validate selected authorization examples, not complete production behavior.

No migration, live rule publish, data deletion or forced repository history rewrite is performed by this document.
