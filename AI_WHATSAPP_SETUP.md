# PowerHouse AI + WhatsApp — Firebase setup

The AI and WhatsApp backend now runs through **Firebase Cloud Functions (2nd gen)**. No Railway environment variables are required for these features, and OpenAI/WhatsApp secrets are kept in Firebase Secret Manager. Firebase recommends 2nd gen Functions for new functions and supports binding secrets to individual functions. citeturn0search4turn0search0

## 1. Firebase project

This repository is configured for Firebase project:

`powerhouse-app-47c4a`

Deploy Functions from the project root:

```bash
firebase login
firebase use powerhouse-app-47c4a
firebase deploy --only functions
```

Cloud Functions deployment requires the Firebase project to use the Blaze plan. citeturn0search5

## 2. Create Firebase secrets

Run these commands from the project root. Firebase CLI will ask for each value securely:

```bash
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN
firebase functions:secrets:set WHATSAPP_APP_SECRET
firebase functions:secrets:set WHATSAPP_VERIFY_TOKEN
firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
firebase functions:secrets:set ADMIN_WHATSAPP_NUMBERS
```

The six secret names are intentionally kept separate so only the Functions that need them receive access. Firebase Secret Manager is the recommended place for sensitive API credentials. citeturn0search0

Optional non-secret AI settings are configured as Firebase parameters during deployment:

- `OPENAI_MODEL` — default `gpt-5`
- `OPENAI_MAX_OUTPUT_TOKENS` — default `1200`

## 3. WhatsApp Business Cloud API

Use a Meta WhatsApp Business Cloud API sender. The Firebase Function calls Meta's Graph API; Firebase is the secure backend, while WhatsApp remains the messaging provider.

Save:

- `WHATSAPP_ACCESS_TOKEN` — Meta permanent/system-user access token
- `WHATSAPP_APP_SECRET` — Meta app secret used to validate webhook signatures
- `WHATSAPP_VERIFY_TOKEN` — a random value you choose for webhook verification
- `WHATSAPP_PHONE_NUMBER_ID` — the WhatsApp Business phone-number ID
- `ADMIN_WHATSAPP_NUMBERS` — comma-separated admin numbers, digits/E.164 format

## 4. Webhook

After Functions are deployed, configure the Meta WhatsApp webhook to the Firebase Function URL:

`https://us-central1-powerhouse-app-47c4a.cloudfunctions.net/whatsappWebhook`

Use the same `WHATSAPP_VERIFY_TOKEN` when Meta asks for the verification token.

The webhook accepts incoming WhatsApp text messages, verifies Meta's signature, identifies the PowerHouse account by WhatsApp number, sends the message to PowerHouse AI, and returns the answer to the same WhatsApp number.

## 5. Access rules

### Admin WhatsApp
Admin numbers receive:

- Full operational AI context
- Panels and cable routes
- Tasks and staff/task summaries
- Fuel entries and stock information
- WAPDA readings
- Engine service logs
- Activities/system information
- AI answers to operational questions

### Normal user WhatsApp
Normal users receive only their own permitted information:

- Own account status
- Own tasks/duties/tools
- Own fuel entries
- Short personal status reports
- AI answers based on their limited context

Other staff members' private data and admin-only datasets are not included in the user context.

## 6. Automatic WhatsApp task alert

When a new Firestore `tasks/{taskId}` document is created, Firebase Functions sends a WhatsApp task alert to the assigned users and configured admin numbers.

## 7. Portal AI

The frontend uses Firebase `httpsCallable()` and the deployed `aiChat`, `aiStatus`, and `sendWhatsAppReport` Functions. No OpenAI key is exposed to the browser.

## 8. Important

Do not commit API keys, WhatsApp access tokens, `.env` files, or Firebase service-account JSON into GitHub. Firebase Secret Manager is used for the sensitive credentials. Update/redeploy Functions after changing a secret so the new secret version is used. citeturn0search0
