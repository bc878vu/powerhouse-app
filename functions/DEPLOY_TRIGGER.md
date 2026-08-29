# PowerHouse AI deployment trigger

This file triggers the Firebase Functions deployment workflow after the repository secret configuration was updated.

The production `aiChat` function uses the Firebase Secret Manager secret named `OPENAI_API_KEY` and declares that secret in its callable function configuration.