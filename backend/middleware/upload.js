const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ============================================================
// UPLOAD DIRECTORY
// ============================================================

const uploadDir = path.join(__dirname, "../uploads");

// Create uploads folder automatically if it does not exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });

  console.log("✅ Uploads directory created:", uploadDir);
}

// ============================================================
// MULTER STORAGE CONFIGURATION
// ============================================================

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },

  filename: function (req, file, cb) {
    try {
      const extension = path
        .extname(file.originalname)
        .toLowerCase();

      const originalBaseName = path.basename(
        file.originalname,
        extension
      );

      const safeBaseName = originalBaseName
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

      const finalBaseName =
        safeBaseName || "file";

      const uniqueName = [
        Date.now(),
        Math.round(Math.random() * 1e9),
        finalBaseName,
      ].join("-") + extension;

      cb(null, uniqueName);
    } catch (error) {
      cb(error);
    }
  },
});

// ============================================================
// ALLOWED FILE TYPES
// ============================================================

const allowedMimeTypes = [
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",

  // Audio
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",

  // Video
  "video/mp4",
  "video/webm",
  "video/quicktime",

  // PDF
  "application/pdf",

  // Documents
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  // Excel
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  // Text
  "text/plain",
  "text/csv",

  // Generic binary
  "application/octet-stream",
];

// ============================================================
// FILE FILTER
// ============================================================

// Validate the extension in addition to the client-reported MIME type.
// This is a first defense, not a replacement for signature scanning.
const allowedExtensions = new Map([
  [".jpg", ["image/jpeg", "image/jpg", "application/octet-stream"]],
  [".jpeg", ["image/jpeg", "image/jpg", "application/octet-stream"]],
  [".png", ["image/png", "application/octet-stream"]],
  [".webp", ["image/webp", "application/octet-stream"]],
  [".gif", ["image/gif", "application/octet-stream"]],
  [".mp3", ["audio/mpeg", "audio/mp3", "application/octet-stream"]],
  [".wav", ["audio/wav", "audio/x-wav", "application/octet-stream"]],
  [".webm", ["audio/webm", "video/webm", "application/octet-stream"]],
  [".ogg", ["audio/ogg", "application/octet-stream"]],
  [".mp4", ["video/mp4", "application/octet-stream"]],
  [".mov", ["video/quicktime", "application/octet-stream"]],
  [".pdf", ["application/pdf", "application/octet-stream"]],
  [".doc", ["application/msword", "application/octet-stream"]],
  [".docx", ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"]],
  [".xls", ["application/vnd.ms-excel", "application/octet-stream"]],
  [".xlsx", ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"]],
  [".txt", ["text/plain", "application/octet-stream"]],
  [".csv", ["text/csv", "text/plain", "application/vnd.ms-excel", "application/octet-stream"]],
]);
const fileFilter = (req, file, cb) => {
  const ext = path.extname(String(file.originalname || "")).toLowerCase();
  if (allowedMimeTypes.includes(file.mimetype) &&
      allowedExtensions.get(ext)?.includes(file.mimetype)) {
    cb(null, true);
    return;
  }

  const error = new Error(
    `Unsupported file type: ${file.mimetype}`
  );

  error.code = "UNSUPPORTED_FILE_TYPE";

  cb(error, false);
};

// ============================================================
// MULTER INSTANCE
// ============================================================

const upload = multer({
  storage,

  fileFilter,

  limits: {
    // Maximum size of one file: 100 MB
    fileSize: 100 * 1024 * 1024,

    // Maximum number of files in one request
    files: 20,
  },
});

// ============================================================
// EXPORT
// ============================================================

module.exports = upload;