# Private uploads rollout (staged)

## Status
The backend now supports `PRIVATE_UPLOADS_ENABLED=true`, which requires a verified Firebase ID token and a non-disabled `powerhouse_users/{uid}` staff profile on every `/uploads/*` request.

**The switch defaults to off to preserve existing task attachment previews, public machine images, and legacy open-in-new-tab links.** Therefore, this patch alone does not make currently served uploads private. Do not set this variable on production until the frontend attachment renderer can request resources with `Authorization: Bearer <Firebase ID token>` and public-facing machine images have been migrated to a deliberate public asset location.

## Before enabling
1. Inventory every `/uploads/` reference and classify public vs private files.
2. Move task attachments/CVs/audio to private storage outside the GitHub repository. Store pointers in existing task records and maintain backward-compatible reads.
3. Add authorized fetching (including previews/downloads) to each attachment client, and test inactive account denial. Direct `<img src>` / `<a href>` browser requests do not automatically include the bearer token.
4. Test authenticated staff, admin, disabled user, anonymous public page and legacy links in staging.
5. Enable `PRIVATE_UPLOADS_ENABLED=true`, verify that direct anonymous requests get 401 and valid staff requests succeed.
6. Remove sensitive files from published Git history using a carefully coordinated history-rewrite process, after secure archival and credential review. A .gitignore entry alone does not remove tracked history.

The current guard checks whether the requester is an active staff member, **not whether they are assigned to an individual task**. Per-task access control is required before treating task attachments as fully confidential. Existing files are not deleted by this change.
