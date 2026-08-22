import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowTaskWithoutAttachments = () => ({
  name: 'allow-task-without-attachments',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/AssignTasks.jsx')) {
      return null
    }

    const blockedAttachmentValidation = /\n\s*if \(!isEdit && files\.length === 0\) \{\n\s*showToast\(\n\s*['"]Please add at least one attachment['"],\n\s*['"]error['"]\n\s*\);\n\s*\n\s*return;\n\s*\}\n/;

    const nextCode = code.replace(blockedAttachmentValidation, '\n');

    if (nextCode === code) {
      return null
    }

    return {
      code: nextCode,
      map: null,
    }
  },
})

export default defineConfig({
  plugins: [
    allowTaskWithoutAttachments(),
    react(),
  ],
})
