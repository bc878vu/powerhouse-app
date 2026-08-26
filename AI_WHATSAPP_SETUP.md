# PowerHouse AI + WhatsApp setup

## 1. Backend environment
Set these Railway backend variables (never put the OpenAI or Twilio secrets in Vercel `VITE_*` variables):

- `OPENAI_API_KEY` = OpenAI API key
- `OPENAI_MODEL` = `gpt-5` (or another model enabled for the account)
- `OPENAI_MAX_OUTPUT_TOKENS` = `1200`
- `TWILIO_ACCOUNT_SID` = Twilio Account SID
- `TWILIO_AUTH_TOKEN` = Twilio Auth Token
- `TWILIO_WHATSAPP_FROM` = approved WhatsApp sender number, E.164 format
- `ADMIN_WHATSAPP_NUMBERS` = comma-separated admin WhatsApp numbers, E.164 format
- `PUBLIC_BACKEND_URL` = public Railway backend URL
- `TWILIO_VALIDATE_SIGNATURE` = `true`
- `AI_ADMIN_CONTEXT_USER_ID` = numeric admin user id used for admin WhatsApp context

## 2. Twilio webhook
Configure the Twilio WhatsApp sender/Sandbox incoming-message webhook as:

`POST https://YOUR-RAILWAY-DOMAIN/api/whatsapp/webhook`

The backend validates the `X-Twilio-Signature` when `TWILIO_VALIDATE_SIGNATURE=true`.

## 3. Behaviour
- Admin portal AI: full operational context.
- Admin WhatsApp: full operational AI report and system summary.
- Staff portal AI: own account/tasks/duties/tools plus safe general information.
- Staff WhatsApp: short personal status/update only.
- AI API key stays on the backend.

## 4. Portal
After deployment, authenticated users get **PowerHouse AI** in the Modules menu at `/ai`.

The page shows AI/WhatsApp configuration status and provides a WhatsApp report action.

## 5. Important
WhatsApp delivery requires an active WhatsApp Business sender/Twilio configuration. Twilio Sandbox can be used for testing; production messaging should use an approved sender and appropriate WhatsApp templates/session rules.
