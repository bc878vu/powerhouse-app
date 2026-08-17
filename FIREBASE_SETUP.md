# PowerHouse Firebase setup

The repository is now prepared for Firebase-first authentication, Firestore panel data, Storage rules, Hosting, and legacy-data migration.

## 1. Firebase Console — one-time setup

Enable these services in the **same Firebase project** used by the web app:

- Authentication -> Sign-in method -> **Email/Password**
- **Firestore Database**
- **Storage**
- **Hosting** if Firebase Hosting will be used instead of Vercel

Add the Firebase Web App configuration to the hosting environment. The frontend expects:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (optional)
- `VITE_VAPID_KEY` (only if browser push notifications are enabled)

A safe template is provided at `frontend/.env.example`. Never put Firebase Admin service-account JSON, private keys, or database passwords in `VITE_*` variables.

## 2. GitHub Actions

The repository has a production frontend build check at `.github/workflows/frontend-build.yml`.

For the workflow to build with Firebase configuration, add these GitHub repository secrets:

`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`, `VITE_VAPID_KEY`.

## 3. Legacy MySQL -> Firebase migration

The migration utility is `backend/migrateMysqlToFirebase.js`.

Provide the Firebase Admin service-account JSON through `FIREBASE_SERVICE_ACCOUNT` and the legacy MySQL connection variables only in a secure local/CI environment, then run from `backend/`:

`node migrateMysqlToFirebase.js`

The migration is designed to import existing bcrypt password hashes into Firebase Authentication and copy legacy users/tasks/activities/duties/categories/tools into Firestore.

Do **not** commit the service-account JSON, database passwords, or `.env` files.

## 4. Deploy Firebase resources

From the repository root, after installing the Firebase CLI and selecting the correct project:

`firebase use <YOUR_FIREBASE_PROJECT_ID>`

`firebase deploy --only firestore:rules,firestore:indexes,storage,hosting`

`firebase.json` automatically builds `frontend` before Hosting deployment.

## 5. Verify before switching production traffic

- Firebase Auth login succeeds.
- `powerhouse_users/{uid}` exists and contains the correct role.
- Panels can be created, loaded, edited, archived/restored, and appear through the Firestore subscription.
- Panel routes/history are persisted in Firestore.
- Fuel entries persist in `entries`.
- Unauthenticated Firestore access is rejected by the rules.
- Browser refresh works on every React route through the Hosting SPA rewrite.
- Production build completes without duplicate Firestore initialization errors.

## 6. Important migration status

The GitHub branch contains the Firebase foundation and the panel/auth migration. The remaining legacy application modules must be migrated module-by-module before the old backend can be retired. Do not delete the legacy backend until all production data domains have been verified in Firestore.
