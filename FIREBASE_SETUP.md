# PowerHouse Firebase setup

## 1. Firebase Console

Enable:
- Authentication -> Sign-in method -> Email/Password
- Firestore Database
- Storage
- Firebase Hosting (optional if Vercel remains the primary host)

Add the existing Firebase web app values to Vercel Production environment variables:
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`, `VITE_VAPID_KEY`.

## 2. Migrate legacy MySQL data

Set a Firebase Admin service account JSON in `FIREBASE_SERVICE_ACCOUNT` and the legacy MySQL connection variables. Then run from `backend/`:

`node migrateMysqlToFirebase.js`

The migration imports the existing bcrypt password hashes into Firebase Authentication and copies users/tasks/activities/duties/categories/tools into Firestore. Firebase supports importing BCRYPT password hashes through the Admin SDK.

## 3. Deploy Firebase rules/indexes/hosting

From the repository root after installing the Firebase CLI and selecting the correct project:

`firebase use <YOUR_FIREBASE_PROJECT_ID>`
`firebase deploy --only firestore:rules,firestore:indexes,storage,hosting`

Do not commit the Admin service-account JSON or any database password.

## 4. Verify

- Firebase Auth user can log in.
- `powerhouse_users/{uid}` exists with the correct role.
- Panels can be created/read/updated and appear in real time.
- Fuel entries persist in `entries`.
- Firestore rules reject unauthenticated access.
