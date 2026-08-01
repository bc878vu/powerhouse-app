const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ======================================================
// PROFILE IMAGE UPLOAD DIRECTORY
// backend/uploads
// ======================================================

const profileUploadDirectory = path.resolve(
  __dirname,
  "../uploads"
);

if (!fs.existsSync(profileUploadDirectory)) {
  fs.mkdirSync(profileUploadDirectory, {
    recursive: true,
  });

  console.log(
    "✅ Uploads directory created:",
    profileUploadDirectory
  );
}

// ======================================================
// ALLOWED PROFILE IMAGE TYPES
// ======================================================

const allowedImageMimeTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const allowedImageExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
];

// ======================================================
// MULTER DISK STORAGE
// IMAGE SAVED IN backend/uploads
// ======================================================

const profileImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, profileUploadDirectory);
  },

  filename: function (req, file, cb) {
    const originalExtension = path
      .extname(file.originalname)
      .toLowerCase();

    const safeExtension = allowedImageExtensions.includes(
      originalExtension
    )
      ? originalExtension
      : ".jpg";

    const originalBaseName = path
      .basename(file.originalname, originalExtension)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80);

    const uniqueFileName = [
      Date.now(),
      Math.round(Math.random() * 1e9),
      originalBaseName || "profile",
    ].join("-");

    cb(
      null,
      `${uniqueFileName}${safeExtension}`
    );
  },
});

// ======================================================
// MULTER PROFILE IMAGE UPLOAD
// ======================================================

const profileImageUpload = multer({
  storage: profileImageStorage,

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },

  fileFilter: function (req, file, cb) {
    const extension = path
      .extname(file.originalname)
      .toLowerCase();

    const validMimeType =
      allowedImageMimeTypes.includes(file.mimetype);

    const validExtension =
      allowedImageExtensions.includes(extension);

    if (!validMimeType || !validExtension) {
      return cb(
        new Error(
          "Only JPG, JPEG, PNG and WEBP profile images are allowed."
        )
      );
    }

    cb(null, true);
  },
});

// ======================================================
// HELPER: PROFILE UPLOAD MIDDLEWARE
// FIELD NAME MUST BE profile_pic
// ======================================================

const handleProfileUpload = (req, res, next) => {
  profileImageUpload.single("profile_pic")(
    req,
    res,
    (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            error: "Profile image is too large",
            message:
              "Profile image must be smaller than 5 MB.",
          });
        }

        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            success: false,
            error: "Unexpected upload field",
            message:
              'Profile image field name must be "profile_pic".',
          });
        }

        return res.status(400).json({
          success: false,
          error: "Profile image upload failed",
          message: err.message,
        });
      }

      if (err) {
        return res.status(400).json({
          success: false,
          error: "Invalid profile image",
          message: err.message,
        });
      }

      next();
    }
  );
};

// ======================================================
// HELPER: CREATE DATABASE IMAGE PATH
// EXAMPLE: /uploads/123456-profile.jpg
// ======================================================

const createProfileImagePath = (file) => {
  if (!file || !file.filename) {
    return null;
  }

  return `/uploads/${file.filename}`;
};

// ======================================================
// HELPER: NORMALIZE EXISTING IMAGE PATH
// Supports:
// filename.jpg
// uploads/filename.jpg
// /uploads/filename.jpg
// http://localhost:5000/uploads/filename.jpg
// ======================================================

const normalizeProfileImagePath = (value) => {
  if (!value) {
    return null;
  }

  const rawValue = String(value).trim();

  if (!rawValue) {
    return null;
  }

  // Keep Base64 images for backward compatibility.
  if (rawValue.startsWith("data:image/")) {
    return rawValue;
  }

  // Full external URL.
  if (
    rawValue.startsWith("http://") ||
    rawValue.startsWith("https://")
  ) {
    return rawValue;
  }

  let cleanPath = rawValue
    .replace(/\\/g, "/")
    .trim();

  const uploadsIndex = cleanPath
    .toLowerCase()
    .lastIndexOf("/uploads/");

  if (uploadsIndex !== -1) {
    cleanPath = cleanPath.slice(
      uploadsIndex
    );
  }

  cleanPath = cleanPath.replace(/^\/+/, "");

  if (
    cleanPath
      .toLowerCase()
      .startsWith("uploads/")
  ) {
    return `/${cleanPath}`;
  }

  return `/uploads/${cleanPath}`;
};

// ======================================================
// HELPER: GET LOCAL FILE PATH FROM DATABASE IMAGE VALUE
// Used when deleting replaced profile image
// ======================================================

const getLocalProfileImageFilePath = (value) => {
  if (!value) {
    return null;
  }

  const rawValue = String(value).trim();

  if (
    !rawValue ||
    rawValue.startsWith("data:") ||
    rawValue.startsWith("http://") ||
    rawValue.startsWith("https://")
  ) {
    return null;
  }

  let cleanPath = rawValue
    .replace(/\\/g, "/")
    .trim();

  const uploadsIndex = cleanPath
    .toLowerCase()
    .lastIndexOf("/uploads/");

  if (uploadsIndex !== -1) {
    cleanPath = cleanPath.slice(
      uploadsIndex + "/uploads/".length
    );
  } else {
    cleanPath = cleanPath
      .replace(/^\/+/, "")
      .replace(/^uploads\//i, "");
  }

  const safeFileName = path.basename(cleanPath);

  if (!safeFileName) {
    return null;
  }

  return path.join(
    profileUploadDirectory,
    safeFileName
  );
};

// ======================================================
// HELPER: DELETE PROFILE IMAGE FILE SAFELY
// ======================================================

const deleteProfileImageFile = async (value) => {
  try {
    const filePath =
      getLocalProfileImageFilePath(value);

    if (!filePath) {
      return false;
    }

    if (!fs.existsSync(filePath)) {
      return false;
    }

    await fs.promises.unlink(filePath);

    console.log(
      "🗑️ Old profile image deleted:",
      filePath
    );

    return true;
  } catch (error) {
    console.error(
      "⚠️ Could not delete old profile image:",
      error.message
    );

    return false;
  }
};

// ======================================================
// HELPER: DELETE NEW UPLOAD AFTER FAILED DB OPERATION
// ======================================================

const cleanupUploadedFile = async (file) => {
  if (!file || !file.path) {
    return;
  }

  try {
    if (fs.existsSync(file.path)) {
      await fs.promises.unlink(file.path);
    }
  } catch (error) {
    console.error(
      "⚠️ Uploaded file cleanup failed:",
      error.message
    );
  }
};

// ======================================================
// HELPER: NORMALIZE EMAIL
// ======================================================

const normalizeEmail = (email) => {
  if (!email) {
    return "";
  }

  return String(email)
    .trim()
    .toLowerCase();
};

// ======================================================
// HELPER: VALIDATE EMAIL
// ======================================================

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
};

// ======================================================
// HELPER: RUN MYSQL QUERY AS PROMISE
// ======================================================

const queryAsync = (sql, values = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (err, results) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(results);
    });
  });
};

// ======================================================
// HELPER: NORMALIZE USER RESULT
// ======================================================

const normalizeUserResult = (user) => {
  if (!user) {
    return null;
  }

  return {
    ...user,

    profile_pic: normalizeProfileImagePath(
      user.profile_pic
    ),
  };
};

// ======================================================
// HELPER: NORMALIZE MULTIPLE USERS
// ======================================================

const normalizeUsersResult = (users) => {
  if (!Array.isArray(users)) {
    return [];
  }

  return users.map(normalizeUserResult);
};

// ======================================================
// HELPER: GENERATE UNIQUE EMPLOYEE ID
// EXAMPLE: PH-4821
// ======================================================

const generateUniqueEmployeeID = async () => {
  const maximumAttempts = 100;

  for (
    let attempt = 0;
    attempt < maximumAttempts;
    attempt += 1
  ) {
    const employeeID =
      "PH-" +
      Math.floor(
        1000 + Math.random() * 9000
      );

    const existing = await queryAsync(
      `
        SELECT id
        FROM users
        WHERE employeeID = ?
        LIMIT 1
      `,
      [employeeID]
    );

    if (existing.length === 0) {
      return employeeID;
    }
  }

  return `PH-${Date.now()}`;
};

// ======================================================
// GET ALL STAFF
// GET /api/user/all
// ======================================================

router.get("/all", async (req, res) => {
  try {
    const sql = `
      SELECT
        id,
        name,
        email,
        role,
        phone,
        COALESCE(category, '') AS category,
        COALESCE(status, 'active') AS status,
        COALESCE(employeeID, '') AS employeeID,
        maritalStatus,
        address,
        backgroundInfo,
        profile_pic
      FROM users
      ORDER BY id DESC
    `;

    const results = await queryAsync(sql);

    return res.status(200).json(
      normalizeUsersResult(results)
    );
  } catch (err) {
    console.error(
      "❌ GET ALL STAFF DB ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      error: "Database error",
      message:
        err.sqlMessage || err.message,
    });
  }
});

// ======================================================
// CREATE STAFF MEMBER
// POST /api/user
// ======================================================

router.post(
  "/",
  handleProfileUpload,
  async (req, res) => {
    try {
      const {
        name,
        password,
        role,
        phone,
        maritalStatus,
        address,
        backgroundInfo,
      } = req.body;

      const cleanName = name
        ? String(name).trim()
        : "";

      const email = normalizeEmail(
        req.body.email
      );

      const cleanRole = role
        ? String(role)
            .trim()
            .toLowerCase()
        : "electrician";

      const cleanPhone = phone
        ? String(phone).trim()
        : null;

      const cleanMaritalStatus =
        maritalStatus
          ? String(
              maritalStatus
            ).trim()
          : "Single";

      const cleanAddress = address
        ? String(address).trim()
        : null;

      const cleanBackgroundInfo =
        backgroundInfo
          ? String(
              backgroundInfo
            ).trim()
          : null;

      // ----------------------------------------------
      // VALIDATION
      // ----------------------------------------------

      if (!cleanName) {
        await cleanupUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          error: "Full name required",
          message:
            "Please enter the employee full name.",
        });
      }

      if (!email) {
        await cleanupUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          error: "Email required",
          message:
            "Please enter an email address.",
        });
      }

      if (!isValidEmail(email)) {
        await cleanupUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          error: "Invalid email",
          message:
            "Please enter a valid email address.",
        });
      }

      if (!password) {
        await cleanupUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          error: "Password required",
          message:
            "Please enter an account password.",
        });
      }

      if (
        String(password).length < 6
      ) {
        await cleanupUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          error: "Weak password",
          message:
            "Password must contain at least 6 characters.",
        });
      }

      const allowedRoles = [
        "electrician",
        "cro",
        "admin",
        "superadmin",
      ];

      if (
        !allowedRoles.includes(cleanRole)
      ) {
        await cleanupUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          error: "Invalid role",
          message:
            "The selected staff role is not valid.",
        });
      }

      const existingEmail =
        await queryAsync(
          `
            SELECT id
            FROM users
            WHERE LOWER(email) = LOWER(?)
            LIMIT 1
          `,
          [email]
        );

      if (existingEmail.length > 0) {
        await cleanupUploadedFile(req.file);

        return res.status(409).json({
          success: false,
          error: "Email already exists",
          message:
            "A staff account with this email address already exists.",
        });
      }

      // ----------------------------------------------
      // CREATE USER
      // ----------------------------------------------

      const employeeID =
        await generateUniqueEmployeeID();

      const hashedPassword =
        await bcrypt.hash(
          String(password),
          10
        );

      const profilePic =
        createProfileImagePath(req.file);

      const sql = `
        INSERT INTO users
        (
          name,
          email,
          password,
          role,
          phone,
          employeeID,
          maritalStatus,
          address,
          backgroundInfo,
          profile_pic,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const insertResult =
        await queryAsync(sql, [
          cleanName,
          email,
          hashedPassword,
          cleanRole,
          cleanPhone,
          employeeID,
          cleanMaritalStatus,
          cleanAddress,
          cleanBackgroundInfo,
          profilePic,
          "active",
        ]);

      const createdUsers =
        await queryAsync(
          `
            SELECT
              id,
              name,
              email,
              role,
              phone,
              employeeID,
              maritalStatus,
              address,
              backgroundInfo,
              profile_pic,
              COALESCE(
                status,
                'active'
              ) AS status
            FROM users
            WHERE id = ?
            LIMIT 1
          `,
          [insertResult.insertId]
        );

      const createdUser =
        normalizeUserResult(
          createdUsers[0]
        );

      console.log(
        `✅ STAFF CREATED: ${cleanName} | ${employeeID}`
      );

      return res.status(201).json({
        success: true,
        msg: "Staff Created ✅",
        message:
          "Staff member created successfully.",
        user: createdUser,
      });
    } catch (err) {
      await cleanupUploadedFile(req.file);

      console.error(
        "❌ CREATE STAFF ERROR:",
        err
      );

      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          error: "Duplicate record",
          message:
            "A user with this email or employee ID already exists.",
        });
      }

      if (
        err.code === "ER_BAD_FIELD_ERROR"
      ) {
        return res.status(500).json({
          success: false,
          error:
            "Database structure error",
          message:
            err.sqlMessage ||
            "A required column is missing from the users table.",
        });
      }

      return res.status(500).json({
        success: false,
        error:
          "Failed to create staff member",
        message:
          err.sqlMessage || err.message,
      });
    }
  }
);

// ======================================================
// UPDATE PROFILE + SECURE PASSWORD CHANGE
// PUT /api/user/update-profile/:id
// ======================================================

router.put(
  "/update-profile/:id",
  async (req, res) => {
    try {
      const userId = req.params.id;

      const {
        name,
        currentPassword,
        newPassword,
        confirmPassword,
      } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Invalid user",
          message:
            "A valid user ID is required.",
        });
      }

      const existingUsers =
        await queryAsync(
          `
            SELECT
              id,
              name,
              email,
              password,
              role,
              phone,
              employeeID,
              maritalStatus,
              address,
              backgroundInfo,
              profile_pic,
              COALESCE(
                status,
                'active'
              ) AS status
            FROM users
            WHERE id = ?
            LIMIT 1
          `,
          [userId]
        );

      if (
        existingUsers.length === 0
      ) {
        return res.status(404).json({
          success: false,
          error: "User not found",
          message:
            "The requested user account does not exist.",
        });
      }

      const existingUser =
        existingUsers[0];

      const cleanName =
        name !== undefined
          ? String(name).trim()
          : String(
              existingUser.name || ""
            ).trim();

      if (!cleanName) {
        return res.status(400).json({
          success: false,
          error: "Name required",
          message:
            "Please enter your name.",
        });
      }

      if (cleanName.length < 2) {
        return res.status(400).json({
          success: false,
          error: "Invalid name",
          message:
            "Name must contain at least 2 characters.",
        });
      }

      const passwordChangeRequested =
        (currentPassword !== undefined &&
          String(currentPassword).length >
            0) ||
        (newPassword !== undefined &&
          String(newPassword).length > 0) ||
        (confirmPassword !== undefined &&
          String(confirmPassword).length >
            0);

      let finalPasswordHash =
        existingUser.password;

      if (passwordChangeRequested) {
        if (!currentPassword) {
          return res.status(400).json({
            success: false,
            error:
              "Current password required",
            message:
              "Please enter your current password.",
          });
        }

        if (!newPassword) {
          return res.status(400).json({
            success: false,
            error:
              "New password required",
            message:
              "Please enter your new password.",
          });
        }

        if (!confirmPassword) {
          return res.status(400).json({
            success: false,
            error:
              "Password confirmation required",
            message:
              "Please confirm your new password.",
          });
        }

        if (
          String(newPassword).length < 6
        ) {
          return res.status(400).json({
            success: false,
            error: "Weak password",
            message:
              "New password must contain at least 6 characters.",
          });
        }

        if (
          String(newPassword) !==
          String(confirmPassword)
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Passwords do not match",
            message:
              "New password and confirm password do not match.",
          });
        }

        const currentPasswordIsCorrect =
          await bcrypt.compare(
            String(currentPassword),
            String(
              existingUser.password
            )
          );

        if (
          !currentPasswordIsCorrect
        ) {
          return res.status(401).json({
            success: false,
            error:
              "Incorrect current password",
            message:
              "The current password you entered is incorrect.",
          });
        }

        const newPasswordMatchesCurrent =
          await bcrypt.compare(
            String(newPassword),
            String(
              existingUser.password
            )
          );

        if (
          newPasswordMatchesCurrent
        ) {
          return res.status(400).json({
            success: false,
            error: "Password unchanged",
            message:
              "New password must be different from your current password.",
          });
        }

        finalPasswordHash =
          await bcrypt.hash(
            String(newPassword),
            10
          );
      }

      await queryAsync(
        `
          UPDATE users
          SET
            name = ?,
            password = ?
          WHERE id = ?
        `,
        [
          cleanName,
          finalPasswordHash,
          userId,
        ]
      );

      const updatedUsers =
        await queryAsync(
          `
            SELECT
              id,
              name,
              email,
              role,
              phone,
              employeeID,
              maritalStatus,
              address,
              backgroundInfo,
              profile_pic,
              COALESCE(
                status,
                'active'
              ) AS status
            FROM users
            WHERE id = ?
            LIMIT 1
          `,
          [userId]
        );

      const updatedUser =
        normalizeUserResult(
          updatedUsers[0]
        );

      console.log(
        passwordChangeRequested
          ? `🔐 PROFILE + PASSWORD UPDATED: USER ID ${userId}`
          : `✅ PROFILE UPDATED: USER ID ${userId}`
      );

      return res.status(200).json({
        success: true,

        msg: passwordChangeRequested
          ? "Profile and password updated successfully!"
          : "Profile updated successfully!",

        message:
          passwordChangeRequested
            ? "Profile and password updated successfully!"
            : "Profile updated successfully!",

        passwordChanged:
          passwordChangeRequested,

        user: updatedUser,
      });
    } catch (err) {
      console.error(
        "❌ PROFILE UPDATE ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        error: "Profile update failed",
        message:
          err.sqlMessage ||
          err.message ||
          "An unexpected error occurred while updating the profile.",
      });
    }
  }
);

// ======================================================
// UPDATE USER
// PUT /api/user/:id
//
// SUPPORTS:
// JSON
// multipart/form-data
// optional profile_pic
// ======================================================

router.put(
  "/:id",
  handleProfileUpload,
  async (req, res) => {
    let existingUser = null;

    try {
      const userId = req.params.id;

      const existingUsers =
        await queryAsync(
          `
            SELECT *
            FROM users
            WHERE id = ?
            LIMIT 1
          `,
          [userId]
        );

      if (
        existingUsers.length === 0
      ) {
        await cleanupUploadedFile(
          req.file
        );

        return res.status(404).json({
          success: false,
          error: "User not found",
          message:
            "The requested staff member does not exist.",
        });
      }

      existingUser =
        existingUsers[0];

      const name =
        req.body.name !== undefined
          ? String(
              req.body.name
            ).trim()
          : existingUser.name;

      const email =
        req.body.email !== undefined
          ? normalizeEmail(
              req.body.email
            )
          : existingUser.email;

      const role =
        req.body.role !== undefined
          ? String(req.body.role)
              .trim()
              .toLowerCase()
          : existingUser.role;

      const phone =
        req.body.phone !== undefined
          ? String(req.body.phone).trim() ||
            null
          : existingUser.phone;

      const maritalStatus =
        req.body.maritalStatus !==
        undefined
          ? String(
              req.body.maritalStatus
            ).trim()
          : existingUser.maritalStatus;

      const address =
        req.body.address !== undefined
          ? String(
              req.body.address
            ).trim() || null
          : existingUser.address;

      const backgroundInfo =
        req.body.backgroundInfo !==
        undefined
          ? String(
              req.body.backgroundInfo
            ).trim() || null
          : existingUser.backgroundInfo;

      const status =
        req.body.status !== undefined
          ? String(req.body.status)
              .trim()
              .toLowerCase()
          : existingUser.status ||
            "active";

      if (!name) {
        await cleanupUploadedFile(
          req.file
        );

        return res.status(400).json({
          success: false,
          error: "Name required",
          message:
            "Please enter the staff member name.",
        });
      }

      if (
        !email ||
        !isValidEmail(email)
      ) {
        await cleanupUploadedFile(
          req.file
        );

        return res.status(400).json({
          success: false,
          error: "Invalid email",
          message:
            "Please enter a valid email address.",
        });
      }

      const allowedRoles = [
        "electrician",
        "cro",
        "admin",
        "superadmin",
      ];

      if (
        !allowedRoles.includes(role)
      ) {
        await cleanupUploadedFile(
          req.file
        );

        return res.status(400).json({
          success: false,
          error: "Invalid role",
          message:
            "The selected staff role is not valid.",
        });
      }

      const allowedStatuses = [
        "active",
        "inactive",
      ];

      if (
        !allowedStatuses.includes(status)
      ) {
        await cleanupUploadedFile(
          req.file
        );

        return res.status(400).json({
          success: false,
          error: "Invalid status",
          message:
            "Status must be active or inactive.",
        });
      }

      const duplicateEmail =
        await queryAsync(
          `
            SELECT id
            FROM users
            WHERE LOWER(email) = LOWER(?)
              AND id != ?
            LIMIT 1
          `,
          [email, userId]
        );

      if (
        duplicateEmail.length > 0
      ) {
        await cleanupUploadedFile(
          req.file
        );

        return res.status(409).json({
          success: false,
          error: "Email already exists",
          message:
            "Another staff account already uses this email address.",
        });
      }

      // ----------------------------------------------
      // PROFILE IMAGE
      // If new image exists -> save new path.
      // Otherwise preserve old path.
      // ----------------------------------------------

      const newProfilePic = req.file
        ? createProfileImagePath(
            req.file
          )
        : existingUser.profile_pic;

      // ----------------------------------------------
      // OPTIONAL PASSWORD UPDATE
      // ----------------------------------------------

      let hashedPassword =
        existingUser.password;

      if (
        req.body.password !==
          undefined &&
        String(
          req.body.password
        ).trim() !== ""
      ) {
        if (
          String(
            req.body.password
          ).length < 6
        ) {
          await cleanupUploadedFile(
            req.file
          );

          return res.status(400).json({
            success: false,
            error: "Weak password",
            message:
              "New password must contain at least 6 characters.",
          });
        }

        hashedPassword =
          await bcrypt.hash(
            String(
              req.body.password
            ),
            10
          );
      }

      // ----------------------------------------------
      // UPDATE DATABASE
      // ----------------------------------------------

      const updateSql = `
        UPDATE users
        SET
          name = ?,
          email = ?,
          password = ?,
          role = ?,
          phone = ?,
          maritalStatus = ?,
          address = ?,
          backgroundInfo = ?,
          status = ?,
          profile_pic = ?
        WHERE id = ?
      `;

      await queryAsync(updateSql, [
        name,
        email,
        hashedPassword,
        role,
        phone,
        maritalStatus,
        address,
        backgroundInfo,
        status,
        newProfilePic,
        userId,
      ]);

      // ----------------------------------------------
      // DELETE OLD IMAGE ONLY AFTER DB UPDATE SUCCESS
      // ----------------------------------------------

      if (
        req.file &&
        existingUser.profile_pic &&
        existingUser.profile_pic !==
          newProfilePic
      ) {
        await deleteProfileImageFile(
          existingUser.profile_pic
        );
      }

      // ----------------------------------------------
      // GET UPDATED USER
      // ----------------------------------------------

      const updatedUsers =
        await queryAsync(
          `
            SELECT
              id,
              name,
              email,
              role,
              phone,
              employeeID,
              maritalStatus,
              address,
              backgroundInfo,
              profile_pic,
              COALESCE(
                status,
                'active'
              ) AS status
            FROM users
            WHERE id = ?
            LIMIT 1
          `,
          [userId]
        );

      const updatedUser =
        normalizeUserResult(
          updatedUsers[0]
        );

      console.log(
        `✅ STAFF UPDATED: USER ID ${userId}`
      );

      if (req.file) {
        console.log(
          `🖼️ PROFILE IMAGE SAVED: ${newProfilePic}`
        );
      }

      return res.status(200).json({
        success: true,
        msg: "Updated ✅",
        message:
          "Staff member updated successfully.",
        user: updatedUser,
      });
    } catch (err) {
      await cleanupUploadedFile(req.file);

      console.error(
        "❌ UPDATE STAFF ERROR:",
        err
      );

      if (
        err.code === "ER_DUP_ENTRY"
      ) {
        return res.status(409).json({
          success: false,
          error: "Duplicate record",
          message:
            "Another staff member already uses this email address.",
        });
      }

      return res.status(500).json({
        success: false,
        error: "Update failed",
        message:
          err.sqlMessage || err.message,
      });
    }
  }
);

// ======================================================
// DELETE USER
// DELETE /api/user/:id
// ======================================================

router.delete(
  "/:id",
  async (req, res) => {
    try {
      const userId = req.params.id;

      const existingUsers =
        await queryAsync(
          `
            SELECT
              id,
              name,
              email,
              employeeID,
              profile_pic
            FROM users
            WHERE id = ?
            LIMIT 1
          `,
          [userId]
        );

      if (
        existingUsers.length === 0
      ) {
        return res.status(404).json({
          success: false,
          error: "User not found",
          message:
            "The requested staff member does not exist.",
        });
      }

      const existingUser =
        existingUsers[0];

      await queryAsync(
        `
          DELETE FROM users
          WHERE id = ?
        `,
        [userId]
      );

      await deleteProfileImageFile(
        existingUser.profile_pic
      );

      console.log(
        `🗑️ STAFF DELETED: USER ID ${userId}`
      );

      return res.status(200).json({
        success: true,
        msg: "Deleted ✅",
        message:
          "Staff member deleted successfully.",
        deletedUser: existingUser,
      });
    } catch (err) {
      console.error(
        "❌ DELETE STAFF ERROR:",
        err
      );

      if (
        err.code ===
          "ER_ROW_IS_REFERENCED_2" ||
        err.errno === 1451
      ) {
        return res.status(409).json({
          success: false,
          error:
            "Cannot delete staff member",
          message:
            "This staff member is connected to tasks, tools or other records. Remove those relationships first or use a soft-delete/archive system.",
        });
      }

      return res.status(500).json({
        success: false,
        error: "Delete failed",
        message:
          err.sqlMessage || err.message,
      });
    }
  }
);

// ======================================================
// GET FULL USER DATA
// GET /api/user/full/:id
// ======================================================

router.get(
  "/full/:id",
  async (req, res) => {
    try {
      const userId = req.params.id;

      const userQuery = `
        SELECT
          id,
          name,
          email,
          role,
          phone,
          COALESCE(
            status,
            'active'
          ) AS status,
          COALESCE(
            employeeID,
            ''
          ) AS employeeID,
          COALESCE(
            category,
            ''
          ) AS category,
          maritalStatus,
          address,
          backgroundInfo,
          profile_pic
        FROM users
        WHERE id = ?
        LIMIT 1
      `;

      const userResults =
        await queryAsync(
          userQuery,
          [userId]
        );

      if (
        userResults.length === 0
      ) {
        return res.status(404).json({
          success: false,
          error: "User not found",
          message:
            "The requested staff member does not exist.",
        });
      }

      const tasksQuery = `
        SELECT
          t.*
        FROM tasks t
        INNER JOIN task_assignments ta
          ON t.id = ta.task_id
        WHERE ta.user_id = ?
        ORDER BY t.id DESC
      `;

      const tasks = await queryAsync(
        tasksQuery,
        [userId]
      );

      const toolsQuery = `
        SELECT *
        FROM tools
        WHERE user_id = ?
        ORDER BY id DESC
      `;

      const tools = await queryAsync(
        toolsQuery,
        [userId]
      );

      const normalizedUser =
        normalizeUserResult(
          userResults[0]
        );

      return res.status(200).json({
        success: true,

        user: normalizedUser,

        tasks,

        tools,

        summary: {
          totalTasks: tasks.length,

          pendingTasks: tasks.filter(
            (task) =>
              task.status === "Pending"
          ).length,

          inProgressTasks:
            tasks.filter(
              (task) =>
                task.status ===
                "In Progress"
            ).length,

          completedTasks:
            tasks.filter(
              (task) =>
                task.status ===
                "Completed"
            ).length,

          totalTools: tools.length,
        },
      });
    } catch (err) {
      console.error(
        "❌ GET FULL USER DATA ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to fetch full user data",
        message:
          err.sqlMessage || err.message,
      });
    }
  }
);

// ======================================================
// SAVE FIREBASE FCM TOKEN
// POST /api/user/save-token
// ======================================================

router.post(
  "/save-token",
  async (req, res) => {
    try {
      const {
        token,
        user_id,
      } = req.body;

      if (!token || !user_id) {
        return res.status(400).json({
          success: false,
          error:
            "Missing token or user",
          message:
            "Both FCM token and user ID are required.",
        });
      }

      const existingUser =
        await queryAsync(
          `
            SELECT id
            FROM users
            WHERE id = ?
            LIMIT 1
          `,
          [user_id]
        );

      if (
        existingUser.length === 0
      ) {
        return res.status(404).json({
          success: false,
          error: "User not found",
          message:
            "Cannot save FCM token because the user does not exist.",
        });
      }

      await queryAsync(
        `
          UPDATE users
          SET fcm_token = ?
          WHERE id = ?
        `,
        [token, user_id]
      );

      return res.status(200).json({
        success: true,
        msg: "Token saved",
        message:
          "Firebase notification token saved successfully.",
      });
    } catch (err) {
      console.error(
        "❌ TOKEN SAVE ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        error: "Database error",
        message:
          err.sqlMessage || err.message,
      });
    }
  }
);

// ======================================================
// MULTER / GENERAL ROUTER ERROR HANDLER
// ======================================================

router.use(
  (err, req, res, next) => {
    console.error(
      "❌ USER ROUTER ERROR:",
      err
    );

    if (
      err instanceof multer.MulterError
    ) {
      if (
        err.code === "LIMIT_FILE_SIZE"
      ) {
        return res.status(400).json({
          success: false,
          error: "File too large",
          message:
            "Profile image must be smaller than 5 MB.",
        });
      }

      return res.status(400).json({
        success: false,
        error: "Upload error",
        message: err.message,
      });
    }

    return res.status(500).json({
      success: false,
      error:
        "Internal server error",
      message:
        err.message ||
        "An unexpected error occurred.",
    });
  }
);

// ======================================================
// EXPORT ROUTER
// ======================================================

module.exports = router;