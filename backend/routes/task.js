// ============================================================
// backend/routes/task.js
// COMPLETE A-TO-Z UPDATED VERSION
//
// FEATURES:
// ✅ Multiple user task assignment
// ✅ Same task ID on reassignment
// ✅ Completed -> Reassign -> Pending
// ✅ Rejected -> Reassign -> Pending
// ✅ Assignment Cycle 1, 2, 3, 4...
// ✅ Repeat assignment count
// ✅ Old assignment history preserved
// ✅ Old completion reports preserved
// ✅ User-specific latest assignment status
// ✅ Accept task
// ✅ Reject task with reason
// ✅ Complete task with evidence
// ✅ Multiple voice notes
// ✅ Multiple media files
// ✅ Due date / deadline
// ✅ Time exceeded detection
// ✅ Exceeded minutes calculation
// ✅ Socket.IO real-time updates
// ✅ Firebase push notifications
// ✅ Secure file deletion
// ============================================================

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const db = require("../config/db");
const upload = require("../middleware/upload");
const admin = require("../firebaseAdmin");

// ============================================================
// DATABASE + UPLOAD CONFIGURATION
// ============================================================

const promiseDb = db.promiseDb ? db.promiseDb : db.promise();

const UPLOAD_DIR = path.resolve(
  __dirname,
  "..",
  "uploads"
);

// ============================================================
// ALLOWED VALUES
// ============================================================

const ALLOWED_PRIORITIES = [
  "Low",
  "Medium",
  "High",
];

const ALLOWED_STATUSES = [
  "Pending",
  "In Progress",
  "Completed",
  "Rejected",
];

// ============================================================
// NORMALIZE STRING ARRAY
// ============================================================

function normalizeStringArray(...values) {
  return [
    ...new Set(
      values.flatMap((value) => {
        if (
          value === undefined ||
          value === null
        ) {
          return [];
        }

        if (Array.isArray(value)) {
          return value
            .map((item) => String(item).trim())
            .filter(Boolean);
        }

        if (typeof value === "string") {
          const trimmed = value.trim();

          if (!trimmed) {
            return [];
          }

          try {
            const parsed = JSON.parse(trimmed);

            if (Array.isArray(parsed)) {
              return parsed
                .map((item) =>
                  String(item).trim()
                )
                .filter(Boolean);
            }

            if (
              parsed !== null &&
              parsed !== undefined
            ) {
              return [
                String(parsed).trim(),
              ].filter(Boolean);
            }
          } catch (error) {
            if (trimmed.includes(",")) {
              return trimmed
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
            }

            return [trimmed];
          }

          return [];
        }

        return [
          String(value).trim(),
        ].filter(Boolean);
      })
    ),
  ];
}

// ============================================================
// NORMALIZE USER IDS
// ============================================================

function normalizeUserIds(body = {}) {
  return normalizeStringArray(
    body.user_ids,
    body["user_ids[]"],
    body.user_id
  );
}

// ============================================================
// NORMALIZE OPTIONAL PANEL ID
// ============================================================

function normalizePanelId(value) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === "" ||
    String(value)
      .trim()
      .toLowerCase() === "null"
  ) {
    return null;
  }

  const panelId = Number(value);

  if (
    !Number.isInteger(panelId) ||
    panelId <= 0
  ) {
    return false;
  }

  return panelId;
}

// ============================================================
// NORMALIZE OPTIONAL DATE
// ============================================================

function normalizeOptionalDate(value) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === "" ||
    String(value)
      .trim()
      .toLowerCase() === "null"
  ) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date;
}

// ============================================================
// FORMAT DATE FOR MYSQL
// ============================================================

function toMySqlDateTime(value) {
  if (!value) return null;

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

// ============================================================
// SPLIT JOINED VALUES
// ============================================================

function splitJoinedValues(
  value,
  separator = ","
) {
  if (
    !value ||
    typeof value !== "string"
  ) {
    return [];
  }

  return value
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

// ============================================================
// BOOLEAN NORMALIZER
// ============================================================

function normalizeBoolean(value) {
  if (
    value === true ||
    value === 1 ||
    value === "1"
  ) {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value
      .trim()
      .toLowerCase();

    return [
      "true",
      "yes",
      "on",
    ].includes(normalized);
  }

  return false;
}

// ============================================================
// CONVERT UPLOADED FILES TO STORED FORMAT
// ============================================================

function toStoredFiles(files) {
  return (files || []).map((file) => ({
    path: `uploads/${file.filename}`,
    type:
      file.mimetype ||
      "application/octet-stream",
    originalName:
      file.originalname || null,
  }));
}

// ============================================================
// NORMALIZE STORED FILE LIST
// ============================================================

function normalizeStoredFileList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item) return null;

      if (typeof item === "string") {
        return {
          path: item,
          type: null,
          originalName: null,
        };
      }

      if (
        typeof item === "object" &&
        item.path
      ) {
        return {
          path: item.path,
          type: item.type || null,
          originalName:
            item.originalName ||
            item.original_name ||
            null,
        };
      }

      return null;
    })
    .filter(Boolean);
}

// ============================================================
// PARSE STORED FILES
// ============================================================

function parseStoredFiles(fileUrl) {
  if (!fileUrl) return [];

  if (Array.isArray(fileUrl)) {
    return normalizeStoredFileList(fileUrl);
  }

  if (typeof fileUrl !== "string") {
    return [];
  }

  const trimmed = fileUrl.trim();

  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);

    if (Array.isArray(parsed)) {
      return normalizeStoredFileList(parsed);
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.path
    ) {
      return normalizeStoredFileList([
        parsed,
      ]);
    }
  } catch (error) {
    // Support old plain string file paths.
  }

  return [
    {
      path: trimmed,
      type: null,
      originalName: null,
    },
  ];
}

// ============================================================
// PARSE VOICE NOTES
// ============================================================

function parseVoiceNotes(
  voiceNotes,
  oldVoiceNote = null
) {
  const parsedVoiceNotes =
    parseStoredFiles(voiceNotes);

  if (
    oldVoiceNote &&
    !parsedVoiceNotes.some(
      (item) =>
        item.path === oldVoiceNote
    )
  ) {
    parsedVoiceNotes.push({
      path: oldVoiceNote,
      type: "audio/webm",
      originalName: null,
    });
  }

  return parsedVoiceNotes;
}

// ============================================================
// MAP COMPLETION RECORD
// ============================================================

function mapCompletionRecord(record) {
  if (!record) return null;

  const mediaFiles = parseStoredFiles(
    record.media_files
  );

  const voiceNotes = parseVoiceNotes(
    record.voice_notes,
    record.voice_note
  );

  const primaryVoiceNote =
    voiceNotes.length > 0
      ? voiceNotes[0]
      : null;

  return {
    id: Number(record.id),

    task_id: Number(record.task_id),

    user_id: Number(record.user_id),

    assignment_cycle:
      record.assignment_cycle !==
        undefined &&
      record.assignment_cycle !== null
        ? Number(record.assignment_cycle)
        : null,

    completion_note:
      record.completion_note || "",

    media_files: mediaFiles,

    media: mediaFiles,

    attachments: mediaFiles,

    voice_notes: voiceNotes,

    voice_note: primaryVoiceNote,

    submitted_at:
      record.submitted_at || null,

    updated_at:
      record.updated_at || null,

    submitted_by: {
      id: Number(record.user_id),

      name:
        record.completion_user_name ||
        null,

      email:
        record.completion_user_email ||
        null,

      role:
        record.completion_user_role ||
        null,

      profile_pic:
        record.completion_user_profile_pic ||
        null,
    },
  };
}

// ============================================================
// FILE PATH SECURITY
// ============================================================

function isPathInside(
  parentPath,
  childPath
) {
  const relative = path.relative(
    parentPath,
    childPath
  );

  return (
    relative === "" ||
    (
      !relative.startsWith("..") &&
      !path.isAbsolute(relative)
    )
  );
}

function resolveStoredFilePath(storedPath) {
  if (
    !storedPath ||
    typeof storedPath !== "string"
  ) {
    return null;
  }

  const normalized = storedPath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  let resolvedPath;

  if (path.isAbsolute(storedPath)) {
    resolvedPath =
      path.resolve(storedPath);
  } else if (
    normalized.startsWith("uploads/")
  ) {
    resolvedPath = path.resolve(
      UPLOAD_DIR,
      normalized.slice(
        "uploads/".length
      )
    );
  } else if (
    normalized.startsWith(
      "backend/uploads/"
    )
  ) {
    resolvedPath = path.resolve(
      __dirname,
      "..",
      "..",
      normalized
    );
  } else {
    resolvedPath = path.resolve(
      __dirname,
      "..",
      normalized
    );
  }

  return isPathInside(
    UPLOAD_DIR,
    resolvedPath
  )
    ? resolvedPath
    : null;
}

async function deleteStoredFiles(
  storedPaths
) {
  const uniquePaths =
    normalizeStringArray(storedPaths);

  for (const storedPath of uniquePaths) {
    const filePath =
      resolveStoredFilePath(storedPath);

    if (
      !filePath ||
      !fs.existsSync(filePath)
    ) {
      continue;
    }

    try {
      await fs.promises.unlink(filePath);

      console.log(
        "✅ File deleted:",
        storedPath
      );
    } catch (error) {
      console.log(
        "⚠️ File delete skipped:",
        storedPath,
        error.message
      );
    }
  }
}

async function cleanupUploadedFiles(
  uploadedFiles
) {
  const storedFiles =
    toStoredFiles(uploadedFiles);

  await deleteStoredFiles(
    storedFiles.map(
      (file) => file.path
    )
  );
}

// ============================================================
// DURATION
// ============================================================

function formatDuration(
  startValue,
  endValue
) {
  const start = new Date(startValue);
  const end = new Date(endValue);

  const diffMs = end - start;

  if (
    !Number.isFinite(diffMs) ||
    diffMs < 0
  ) {
    return null;
  }

  const totalMinutes = Math.floor(
    diffMs / 60000
  );

  const hours = Math.floor(
    totalMinutes / 60
  );

  const minutes =
    totalMinutes % 60;

  return `${hours}h ${minutes}m`;
}

// ============================================================
// VALIDATION
// ============================================================

function normalizePriority(priority) {
  if (
    priority === undefined ||
    priority === null ||
    String(priority).trim() === ""
  ) {
    return "Medium";
  }

  const input =
    String(priority).trim();

  return (
    ALLOWED_PRIORITIES.find(
      (item) =>
        item.toLowerCase() ===
        input.toLowerCase()
    ) || null
  );
}

function normalizeStatus(status) {
  if (
    status === undefined ||
    status === null ||
    String(status).trim() === ""
  ) {
    return null;
  }

  const input =
    String(status).trim();

  return (
    ALLOWED_STATUSES.find(
      (item) =>
        item.toLowerCase() ===
        input.toLowerCase()
    ) || null
  );
}

async function validateUserIds(
  connection,
  userIds
) {
  if (!userIds.length) {
    return {
      valid: false,
      validIds: [],
      invalidIds: [],
    };
  }

  const placeholders = userIds
    .map(() => "?")
    .join(",");

  const [rows] =
    await connection.query(
      `
        SELECT id
        FROM users
        WHERE id IN (${placeholders})
      `,
      userIds
    );

  const validIds = (rows || []).map(
    (row) => String(row.id)
  );

  const invalidIds = userIds.filter(
    (id) =>
      !validIds.includes(String(id))
  );

  return {
    valid: invalidIds.length === 0,
    validIds,
    invalidIds,
  };
}

async function validatePanelId(
  connection,
  panelId
) {
  if (panelId === null) {
    return {
      valid: true,
      panel: null,
    };
  }

  const [rows] =
    await connection.query(
      `
        SELECT
          id,
          panel_code,
          panel_name,
          panel_type,
          area,
          location,
          status,
          status_reason
        FROM panels
        WHERE id = ?
          AND is_deleted = 0
        LIMIT 1
      `,
      [panelId]
    );

  return rows.length
    ? {
        valid: true,
        panel: rows[0],
      }
    : {
        valid: false,
        panel: null,
      };
}

// ============================================================
// CURRENT ASSIGNMENTS
// ============================================================

async function insertAssignments(
  connection,
  taskId,
  userIds
) {
  const uniqueUserIds = [
    ...new Set(
      userIds.map((id) => String(id))
    ),
  ];

  if (!uniqueUserIds.length) {
    return;
  }

  const placeholders =
    uniqueUserIds
      .map(() => "(?, ?)")
      .join(", ");

  const values =
    uniqueUserIds.flatMap(
      (userId) => [
        taskId,
        userId,
      ]
    );

  await connection.query(
    `
      INSERT INTO task_assignments
      (
        task_id,
        user_id
      )
      VALUES ${placeholders}
    `,
    values
  );
}

async function replaceAssignments(
  connection,
  taskId,
  userIds
) {
  await connection.query(
    `
      DELETE FROM task_assignments
      WHERE task_id = ?
    `,
    [taskId]
  );

  await insertAssignments(
    connection,
    taskId,
    userIds
  );
}

// ============================================================
// ASSIGNMENT HISTORY HELPERS
// ============================================================

async function getNextAssignmentCycle(
  connection,
  taskId
) {
  const [rows] =
    await connection.query(
      `
        SELECT
          COALESCE(
            MAX(assignment_cycle),
            0
          ) AS max_cycle
        FROM task_assignment_history
        WHERE task_id = ?
      `,
      [taskId]
    );

  return (
    Number(
      rows[0]?.max_cycle || 0
    ) + 1
  );
}

async function getLatestAssignmentCycle(
  connection,
  taskId
) {
  const [rows] =
    await connection.query(
      `
        SELECT
          COALESCE(
            MAX(assignment_cycle),
            0
          ) AS cycle
        FROM task_assignment_history
        WHERE task_id = ?
      `,
      [taskId]
    );

  return Number(
    rows[0]?.cycle || 0
  );
}

async function getLatestUserAssignment(
  connection,
  taskId,
  userId
) {
  const [rows] =
    await connection.query(
      `
        SELECT *
        FROM task_assignment_history
        WHERE task_id = ?
          AND user_id = ?
        ORDER BY
          assignment_cycle DESC,
          assigned_at DESC,
          id DESC
        LIMIT 1
      `,
      [taskId, userId]
    );

  return rows[0] || null;
}

async function insertAssignmentHistory(
  connection,
  taskId,
  userIds,
  {
    assignmentCycle = null,
    status = "Pending",
    dueAt = null,
  } = {}
) {
  const uniqueUserIds = [
    ...new Set(
      userIds.map((id) => Number(id))
    ),
  ].filter(
    (id) =>
      Number.isInteger(id) &&
      id > 0
  );

  if (!uniqueUserIds.length) {
    return null;
  }

  const cycle =
    assignmentCycle ||
    (
      await getNextAssignmentCycle(
        connection,
        taskId
      )
    );

  const placeholders =
    uniqueUserIds
      .map(
        () =>
          "(?, ?, ?, ?, NOW(), ?, 0, 0, NOW(), NOW())"
      )
      .join(", ");

  const values =
    uniqueUserIds.flatMap(
      (userId) => [
        taskId,
        cycle,
        userId,
        status,
        dueAt
          ? toMySqlDateTime(dueAt)
          : null,
      ]
    );

  await connection.query(
    `
      INSERT INTO task_assignment_history
      (
        task_id,
        assignment_cycle,
        user_id,
        status,
        assigned_at,
        due_at,
        time_exceeded,
        exceeded_minutes,
        created_at,
        updated_at
      )
      VALUES ${placeholders}
    `,
    values
  );

  return cycle;
}

// ============================================================
// UPDATE ASSIGNMENT HISTORY STATUS
// IMPORTANT:
// Updates latest cycle for a specific user.
// ============================================================

async function updateAssignmentHistoryStatus(
  connection,
  taskId,
  userId,
  status,
  rejectionReason = null
) {
  let assignmentCycle;

  if (
    userId !== undefined &&
    userId !== null &&
    Number.isInteger(Number(userId)) &&
    Number(userId) > 0
  ) {
    const latestAssignment =
      await getLatestUserAssignment(
        connection,
        taskId,
        Number(userId)
      );

    if (!latestAssignment) {
      return null;
    }

    assignmentCycle = Number(
      latestAssignment.assignment_cycle
    );
  } else {
    assignmentCycle =
      await getLatestAssignmentCycle(
        connection,
        taskId
      );
  }

  if (!assignmentCycle) {
    return null;
  }

  let whereUserSql = "";

  const whereValues = [];

  if (
    userId !== undefined &&
    userId !== null &&
    Number.isInteger(Number(userId)) &&
    Number(userId) > 0
  ) {
    whereUserSql =
      " AND user_id = ?";

    whereValues.push(
      Number(userId)
    );
  }

  let updateSql = `
    status = ?,
    updated_at = NOW()
  `;

  const updateValues = [status];

  if (status === "Pending") {
    updateSql += `,
      accepted_at = NULL,
      completed_at = NULL,
      rejected_at = NULL,
      rejection_reason = NULL,
      time_exceeded = 0,
      exceeded_minutes = 0
    `;
  }

  if (status === "In Progress") {
    updateSql += `,
      accepted_at =
        COALESCE(accepted_at, NOW()),
      completed_at = NULL,
      rejected_at = NULL,
      rejection_reason = NULL
    `;
  }

  if (status === "Completed") {
    updateSql += `,
      accepted_at =
        COALESCE(accepted_at, NOW()),

      completed_at = NOW(),

      rejected_at = NULL,

      rejection_reason = NULL,

      time_exceeded =
        CASE
          WHEN
            due_at IS NOT NULL
            AND NOW() > due_at
          THEN 1
          ELSE 0
        END,

      exceeded_minutes =
        CASE
          WHEN
            due_at IS NOT NULL
            AND NOW() > due_at
          THEN
            TIMESTAMPDIFF(
              MINUTE,
              due_at,
              NOW()
            )
          ELSE 0
        END
    `;
  }

  if (status === "Rejected") {
    updateSql += `,
      rejected_at = NOW(),

      rejection_reason = ?,

      completed_at = NULL,

      time_exceeded =
        CASE
          WHEN
            due_at IS NOT NULL
            AND NOW() > due_at
          THEN 1
          ELSE 0
        END,

      exceeded_minutes =
        CASE
          WHEN
            due_at IS NOT NULL
            AND NOW() > due_at
          THEN
            TIMESTAMPDIFF(
              MINUTE,
              due_at,
              NOW()
            )
          ELSE 0
        END
    `;

    updateValues.push(
      rejectionReason || null
    );
  }

  await connection.query(
    `
      UPDATE task_assignment_history
      SET ${updateSql}
      WHERE task_id = ?
        AND assignment_cycle = ?
        ${whereUserSql}
    `,
    [
      ...updateValues,
      taskId,
      assignmentCycle,
      ...whereValues,
    ]
  );

  return assignmentCycle;
}

// ============================================================
// MAP TASK RECORD
// ============================================================

function mapTaskRecord(record) {
  const assignedUserIds =
    record.assigned_user_ids
      ? splitJoinedValues(
          String(
            record.assigned_user_ids
          ),
          ","
        )
      : normalizeStringArray(
          record.user_id
        );

  const assignedStaffNames =
    record.assigned_staff_names
      ? splitJoinedValues(
          String(
            record.assigned_staff_names
          ),
          "||"
        )
      : normalizeStringArray(
          record.staff_name
        );

  const assignedEmails =
    record.assigned_staff_emails
      ? splitJoinedValues(
          String(
            record.assigned_staff_emails
          ),
          "||"
        )
      : [];

  const assignedRoles =
    record.assigned_staff_roles
      ? splitJoinedValues(
          String(
            record.assigned_staff_roles
          ),
          "||"
        )
      : [];

  const media = parseStoredFiles(
    record.file_url
  );

  const task = {
    ...record,

    id: Number(record.id),

    panel_id:
      record.panel_id !== undefined &&
      record.panel_id !== null
        ? Number(record.panel_id)
        : null,

    panel: record.panel_id
      ? {
          id: Number(record.panel_id),

          panel_code:
            record.panel_code || null,

          panel_name:
            record.panel_name || null,

          panel_type:
            record.panel_type || null,

          area:
            record.panel_area || null,

          location:
            record.panel_location || null,

          status:
            record.panel_status || null,

          status_reason:
            record.panel_status_reason ||
            null,
        }
      : null,

    user_id:
      assignedUserIds[0] ||
      record.user_id ||
      null,

    staff_name:
      assignedStaffNames[0] ||
      record.staff_name ||
      null,

    profile_pic:
      record.profile_pic || null,

    assigned_user_ids:
      assignedUserIds,

    assigned_staff_names:
      assignedStaffNames,

    assigned_users:
      assignedUserIds.map(
        (userId, index) => ({
          user_id: userId,

          name:
            assignedStaffNames[index] ||
            null,

          email:
            assignedEmails[index] ||
            null,

          role:
            assignedRoles[index] ||
            null,
        })
      ),

    user_ids_label:
      assignedUserIds.join(", "),

    staff_names_label:
      assignedStaffNames.join(", "),

    media,

    attachments: media,
  };

  task.duration =
    record.accepted_at &&
    record.completed_at
      ? formatDuration(
          record.accepted_at,
          record.completed_at
        )
      : null;

  return task;
}

// ============================================================
// REUSABLE SQL
// ============================================================

const assignmentSummarySql = `
  LEFT JOIN (
    SELECT
      assignment_rows.task_id,

      SUBSTRING_INDEX(
        GROUP_CONCAT(
          assignment_rows.user_id
          ORDER BY assignment_rows.user_id
          SEPARATOR ','
        ),
        ',',
        1
      ) AS primary_user_id,

      SUBSTRING_INDEX(
        GROUP_CONCAT(
          COALESCE(u.name, '')
          ORDER BY assignment_rows.user_id
          SEPARATOR '||'
        ),
        '||',
        1
      ) AS primary_staff_name,

      SUBSTRING_INDEX(
        GROUP_CONCAT(
          COALESCE(
            NULLIF(u.profile_pic, ''),
            ''
          )
          ORDER BY assignment_rows.user_id
          SEPARATOR '||'
        ),
        '||',
        1
      ) AS primary_profile_pic,

      GROUP_CONCAT(
        assignment_rows.user_id
        ORDER BY assignment_rows.user_id
        SEPARATOR ','
      ) AS assigned_user_ids,

      GROUP_CONCAT(
        COALESCE(u.name, '')
        ORDER BY assignment_rows.user_id
        SEPARATOR '||'
      ) AS assigned_staff_names,

      GROUP_CONCAT(
        COALESCE(u.email, '')
        ORDER BY assignment_rows.user_id
        SEPARATOR '||'
      ) AS assigned_staff_emails,

      GROUP_CONCAT(
        COALESCE(u.role, '')
        ORDER BY assignment_rows.user_id
        SEPARATOR '||'
      ) AS assigned_staff_roles

    FROM (
      SELECT DISTINCT
        task_id,
        user_id
      FROM task_assignments
    ) AS assignment_rows

    LEFT JOIN users u
      ON assignment_rows.user_id = u.id

    GROUP BY
      assignment_rows.task_id

  ) AS assignment_summary
    ON t.id =
      assignment_summary.task_id
`;

const panelSelectFields = `
  p.panel_code,
  p.panel_name,
  p.panel_type,
  p.area AS panel_area,
  p.location AS panel_location,
  p.status AS panel_status,
  p.status_reason AS panel_status_reason
`;

// ============================================================
// FETCH RECIPIENTS
// ============================================================

async function fetchTaskRecipients(
  taskId
) {
  const [rows] =
    await promiseDb.query(
      `
        SELECT DISTINCT
          t.id AS taskId,
          t.title,
          t.status,
          t.panel_id,
          ta.user_id

        FROM tasks t

        LEFT JOIN task_assignments ta
          ON t.id = ta.task_id

        WHERE t.id = ?
      `,
      [taskId]
    );

  return (rows || []).filter(
    (row) =>
      row.user_id !== null &&
      row.user_id !== undefined
  );
}

// ============================================================
// SOCKET
// ============================================================

function emitTaskEvent(
  io,
  recipients,
  eventName,
  extraPayload = {}
) {
  const time = new Date();

  recipients.forEach(
    (recipient) => {
      io.to(
        `user_${recipient.user_id}`
      ).emit(eventName, {
        taskId: recipient.taskId,

        title: recipient.title,

        status: recipient.status,

        panel_id:
          recipient.panel_id || null,

        time,

        ...extraPayload,
      });
    }
  );
}

// ============================================================
// FIREBASE PUSH
// ============================================================

async function sendPushNotification({
  userIds,
  title,
  body,
  taskId,
  type = "taskUpdate",
}) {
  try {
    if (
      !admin ||
      !admin.messaging ||
      !userIds ||
      !userIds.length
    ) {
      return;
    }

    const uniqueIds = [
      ...new Set(
        userIds.map((id) =>
          String(id)
        )
      ),
    ];

    const placeholders =
      uniqueIds
        .map(() => "?")
        .join(",");

    const [users] =
      await promiseDb.query(
        `
          SELECT DISTINCT
            fcm_token
          FROM users
          WHERE id IN (${placeholders})
            AND fcm_token IS NOT NULL
            AND TRIM(fcm_token) != ''
        `,
        uniqueIds
      );

    const tokens = [
      ...new Set(
        (users || [])
          .map(
            (user) =>
              user.fcm_token
          )
          .filter(Boolean)
      ),
    ];

    if (!tokens.length) return;

    const response =
      await admin
        .messaging()
        .sendEachForMulticast({
          tokens,

          notification: {
            title,
            body,
          },

          data: {
            taskId: String(taskId),

            type: String(type),

            click_action:
              "FLUTTER_NOTIFICATION_CLICK",
          },
        });

    console.log(
      `✅ Push notification sent. Success: ${response.successCount}, Failed: ${response.failureCount}`
    );
  } catch (error) {
    console.error(
      "❌ Push Notification Error:",
      error.message
    );
  }
}

// ============================================================
// FETCH COMPLETIONS
// ============================================================

async function fetchTaskCompletions(
  taskId
) {
  const [rows] =
    await promiseDb.query(
      `
        SELECT
          tc.*,

          u.name
            AS completion_user_name,

          u.email
            AS completion_user_email,

          u.role
            AS completion_user_role,

          u.profile_pic
            AS completion_user_profile_pic

        FROM task_completions tc

        LEFT JOIN users u
          ON tc.user_id = u.id

        WHERE tc.task_id = ?

        ORDER BY
          tc.submitted_at DESC,
          tc.id DESC
      `,
      [taskId]
    );

  return (rows || []).map(
    mapCompletionRecord
  );
}

// ============================================================
// FETCH ASSIGNMENT HISTORY
// ============================================================

async function fetchAssignmentHistory(
  taskId
) {
  const [rows] =
    await promiseDb.query(
      `
        SELECT
          h.*,

          u.name AS user_name,

          u.email AS user_email,

          u.role AS user_role,

          u.profile_pic
            AS user_profile_pic

        FROM task_assignment_history h

        LEFT JOIN users u
          ON h.user_id = u.id

        WHERE h.task_id = ?

        ORDER BY
          h.assignment_cycle DESC,
          h.assigned_at DESC,
          h.id DESC
      `,
      [taskId]
    );

  return rows || [];
}

// ============================================================
// APPLY CURRENT USER ASSIGNMENT TO TASK
// Critical for MyTasks.jsx
// ============================================================

function applyCurrentUserAssignment(
  task,
  assignmentHistory,
  userId
) {
  const numericUserId =
    Number(userId);

  const currentUserHistory = (
    assignmentHistory || []
  )
    .filter(
      (item) =>
        Number(item.user_id) ===
        numericUserId
    )
    .sort((a, b) => {
      const cycleDifference =
        Number(
          b.assignment_cycle || 0
        ) -
        Number(
          a.assignment_cycle || 0
        );

      if (cycleDifference !== 0) {
        return cycleDifference;
      }

      const assignedDifference =
        new Date(
          b.assigned_at || 0
        ).getTime() -
        new Date(
          a.assigned_at || 0
        ).getTime();

      if (assignedDifference !== 0) {
        return assignedDifference;
      }

      return (
        Number(b.id || 0) -
        Number(a.id || 0)
      );
    });

  const currentAssignment =
    currentUserHistory[0] || null;

  task.assignment_history =
    assignmentHistory || [];

  task.user_assignment_history =
    currentUserHistory;

  task.current_assignment =
    currentAssignment;

  task.assignment_count =
    currentUserHistory.length;

  task.repeat_count = Math.max(
    currentUserHistory.length - 1,
    0
  );

  if (!currentAssignment) {
    return task;
  }

  task.status =
    currentAssignment.status ||
    "Pending";

  task.assignment_cycle =
    Number(
      currentAssignment.assignment_cycle ||
      1
    );

  task.assigned_at =
    currentAssignment.assigned_at ||
    null;

  task.accepted_at =
    currentAssignment.accepted_at ||
    null;

  task.completed_at =
    currentAssignment.completed_at ||
    null;

  task.rejected_at =
    currentAssignment.rejected_at ||
    null;

  task.rejection_reason =
    currentAssignment.rejection_reason ||
    null;

  task.due_at =
    currentAssignment.due_at || null;

  task.time_exceeded =
    Number(
      currentAssignment.time_exceeded ||
      0
    );

  task.exceeded_minutes =
    Number(
      currentAssignment.exceeded_minutes ||
      0
    );

  task.duration =
    currentAssignment.accepted_at &&
    currentAssignment.completed_at
      ? formatDuration(
          currentAssignment.accepted_at,
          currentAssignment.completed_at
        )
      : null;

  return task;
}

// ============================================================
// FETCH COMPLETE TASK
// ============================================================

async function fetchCompleteTask(
  taskId
) {
  const [rows] =
    await promiseDb.query(
      `
        SELECT
          t.*,

          ${panelSelectFields},

          assignment_summary.primary_user_id
            AS user_id,

          assignment_summary.primary_staff_name
            AS staff_name,

          assignment_summary.primary_profile_pic
            AS profile_pic,

          assignment_summary.assigned_user_ids,

          assignment_summary.assigned_staff_names,

          assignment_summary.assigned_staff_emails,

          assignment_summary.assigned_staff_roles

        FROM tasks t

        LEFT JOIN panels p
          ON t.panel_id = p.id
          AND p.is_deleted = 0

        ${assignmentSummarySql}

        WHERE t.id = ?

        LIMIT 1
      `,
      [taskId]
    );

  if (!rows.length) {
    return null;
  }

  const task =
    mapTaskRecord(rows[0]);

  const [
    completionReports,
    assignmentHistory,
  ] = await Promise.all([
    fetchTaskCompletions(taskId),

    fetchAssignmentHistory(taskId),
  ]);

  task.completion_reports =
    completionReports;

  task.latest_completion =
    completionReports.length > 0
      ? completionReports[0]
      : null;

  task.has_completion_report =
    completionReports.length > 0;

  task.assignment_history =
    assignmentHistory;

  task.latest_assignment =
    assignmentHistory.length > 0
      ? assignmentHistory[0]
      : null;

  task.assignment_cycle =
    task.latest_assignment
      ? Number(
          task.latest_assignment
            .assignment_cycle || 1
        )
      : 1;

  task.assignment_count =
    new Set(
      assignmentHistory.map(
        (item) =>
          Number(
            item.assignment_cycle || 1
          )
      )
    ).size;

  task.repeat_count = Math.max(
    task.assignment_count - 1,
    0
  );

  return task;
}

// ============================================================
// POST /assign
// NEW TASK ASSIGNMENT
// ============================================================

router.post(
  "/assign",

  upload.array("files", 20),

  async (req, res) => {
    const uploadedFiles =
      req.files ||
      (
        req.file
          ? [req.file]
          : []
      );

    const {
      title,
      description,
      category,
    } = req.body;

    const userIds =
      normalizeUserIds(req.body);

    const priority =
      normalizePriority(
        req.body.priority
      );

    const panelId =
      normalizePanelId(
        req.body.panel_id
      );

    const dueAt =
      normalizeOptionalDate(
        req.body.due_at ??
        req.body.due_date
      );

    if (dueAt === false) {
      await cleanupUploadedFiles(
        uploadedFiles
      );

      return res.status(400).json({
        success: false,
        msg: "Invalid due date",
      });
    }

    if (panelId === false) {
      await cleanupUploadedFiles(
        uploadedFiles
      );

      return res.status(400).json({
        success: false,
        msg: "Invalid panel ID",
      });
    }

    if (
      !title ||
      !String(title).trim()
    ) {
      await cleanupUploadedFiles(
        uploadedFiles
      );

      return res.status(400).json({
        success: false,
        msg: "Task title is required",
      });
    }

    if (!userIds.length) {
      await cleanupUploadedFiles(
        uploadedFiles
      );

      return res.status(400).json({
        success: false,
        msg:
          "Please select at least one staff member",
      });
    }

    if (!priority) {
      await cleanupUploadedFiles(
        uploadedFiles
      );

      return res.status(400).json({
        success: false,
        msg:
          "Invalid priority. Allowed: Low, Medium, High",
      });
    }

    const storedFiles =
      toStoredFiles(uploadedFiles);

    const fileUrl =
      storedFiles.length
        ? JSON.stringify(storedFiles)
        : null;

    let connection;

    let transactionStarted = false;

    try {
      connection =
        await promiseDb.getConnection();

      await connection.beginTransaction();

      transactionStarted = true;

      const userValidation =
        await validateUserIds(
          connection,
          userIds
        );

      if (!userValidation.valid) {
        await connection.rollback();

        transactionStarted = false;

        await cleanupUploadedFiles(
          uploadedFiles
        );

        return res.status(400).json({
          success: false,

          msg:
            "One or more selected users do not exist",

          invalidUserIds:
            userValidation.invalidIds,
        });
      }

      const panelValidation =
        await validatePanelId(
          connection,
          panelId
        );

      if (!panelValidation.valid) {
        await connection.rollback();

        transactionStarted = false;

        await cleanupUploadedFiles(
          uploadedFiles
        );

        return res.status(400).json({
          success: false,

          msg:
            `Panel with ID ${panelId} does not exist or is deleted`,
        });
      }

      const [result] =
        await connection.query(
          `
            INSERT INTO tasks
            (
              title,
              description,
              category,
              priority,
              status,
              file_url,
              panel_id
            )
            VALUES
            (
              ?,
              ?,
              ?,
              ?,
              'Pending',
              ?,
              ?
            )
          `,
          [
            String(title).trim(),

            description !== undefined
              ? description
              : null,

            category !== undefined
              ? category
              : null,

            priority,

            fileUrl,

            panelId,
          ]
        );

      const taskId =
        result.insertId;

      await insertAssignments(
        connection,
        taskId,
        userValidation.validIds
      );

      await insertAssignmentHistory(
        connection,
        taskId,
        userValidation.validIds,
        {
          assignmentCycle: 1,

          status: "Pending",

          dueAt,
        }
      );

      await connection.commit();

      transactionStarted = false;

      const createdTask =
        await fetchCompleteTask(taskId);

      try {
        const io =
          req.app.get("io");

        if (io) {
          io.emit("updateData");

          const recipients =
            await fetchTaskRecipients(
              taskId
            );

          emitTaskEvent(
            io,
            recipients,
            "taskAssigned",
            {
              msg:
                "New Task Assigned",

              status: "Pending",

              assignment_cycle: 1,
            }
          );
        }
      } catch (socketError) {
        console.error(
          "⚠️ Socket event error:",
          socketError.message
        );
      }

      await sendPushNotification({
        userIds:
          userValidation.validIds,

        title:
          "📢 New Task Assigned",

        body:
          `You have a new task: ${String(
            title
          ).trim()}`,

        taskId,

        type: "taskAssigned",
      });

      return res.status(201).json({
        success: true,

        taskId,

        msg:
          "Task assigned successfully",

        task: createdTask,
      });
    } catch (error) {
      if (
        connection &&
        transactionStarted
      ) {
        try {
          await connection.rollback();
        } catch {}
      }

      await cleanupUploadedFiles(
        uploadedFiles
      );

      console.error(
        "❌ Task insert error:",
        error
      );

      return res.status(500).json({
        success: false,

        msg:
          "Failed to assign task",

        error:
          process.env.NODE_ENV ===
          "development"
            ? error.sqlMessage ||
              error.message
            : undefined,
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

// ============================================================
// GET /my-tasks/:userId
// CRITICAL FIX:
// Returns latest assignment cycle/status for current user.
// ============================================================

router.get(
  "/my-tasks/:userId",

  async (req, res) => {
    try {
      const userId = Number(
        req.params.userId
      );

      if (
        !Number.isInteger(userId) ||
        userId <= 0
      ) {
        return res.status(400).json({
          success: false,

          msg: "Invalid user ID",
        });
      }

      const [rows] =
        await promiseDb.query(
          `
            SELECT
              t.*,

              ${panelSelectFields},

              ta.user_id

            FROM tasks t

            INNER JOIN task_assignments ta
              ON t.id = ta.task_id
              AND ta.user_id = ?

            LEFT JOIN panels p
              ON t.panel_id = p.id
              AND p.is_deleted = 0

            ORDER BY
              t.updated_at DESC,
              t.created_at DESC,
              t.id DESC
          `,
          [userId]
        );

      const tasks =
        await Promise.all(
          (rows || []).map(
            async (row) => {
              const task =
                mapTaskRecord(row);

              const [
                assignmentHistory,
                completionReports,
              ] = await Promise.all([
                fetchAssignmentHistory(
                  task.id
                ),

                fetchTaskCompletions(
                  task.id
                ),
              ]);

              task.completion_reports =
                completionReports;

              task.latest_completion =
                completionReports.length > 0
                  ? completionReports[0]
                  : null;

              task.has_completion_report =
                completionReports.length > 0;

              applyCurrentUserAssignment(
                task,
                assignmentHistory,
                userId
              );

              return task;
            }
          )
        );

      return res.json(tasks);
    } catch (error) {
      console.error(
        "❌ My tasks fetch error:",
        error
      );

      return res.status(500).json({
        success: false,

        msg:
          "Failed to fetch tasks",

        error:
          process.env.NODE_ENV ===
          "development"
            ? error.sqlMessage ||
              error.message
            : undefined,
      });
    }
  }
);

// ============================================================
// GET /activity/stats
// ============================================================

router.get(
  "/activity/stats",

  async (req, res) => {
    try {
      const [statsRows] =
        await promiseDb.query(`
          SELECT
            COUNT(*) AS taskCount,

            SUM(
              status = 'Pending'
            ) AS pendingCount,

            SUM(
              status = 'In Progress'
            ) AS runningCount,

            SUM(
              status = 'Completed'
            ) AS closedCount,

            SUM(
              status = 'Rejected'
            ) AS rejectedCount

          FROM tasks
        `);

      const [staffRows] =
        await promiseDb.query(`
          SELECT
            COUNT(*) AS staffCount

          FROM users

          WHERE role != 'superadmin'
        `);

      const [activities] =
        await promiseDb.query(`
          SELECT
            t.*,

            ${panelSelectFields},

            assignment_summary.primary_user_id
              AS user_id,

            assignment_summary.primary_staff_name
              AS staff_name,

            assignment_summary.primary_profile_pic
              AS profile_pic,

            assignment_summary.assigned_user_ids,

            assignment_summary.assigned_staff_names,

            assignment_summary.assigned_staff_emails,

            assignment_summary.assigned_staff_roles

          FROM tasks t

          LEFT JOIN panels p
            ON t.panel_id = p.id
            AND p.is_deleted = 0

          ${assignmentSummarySql}

          ORDER BY
            t.updated_at DESC,
            t.created_at DESC,
            t.id DESC
        `);

      return res.json({
        staffCount:
          Number(
            staffRows[0]?.staffCount
          ) || 0,

        taskCount:
          Number(
            statsRows[0]?.taskCount
          ) || 0,

        pendingCount:
          Number(
            statsRows[0]?.pendingCount
          ) || 0,

        runningCount:
          Number(
            statsRows[0]?.runningCount
          ) || 0,

        closedCount:
          Number(
            statsRows[0]?.closedCount
          ) || 0,

        rejectedCount:
          Number(
            statsRows[0]?.rejectedCount
          ) || 0,

        activities:
          (activities || []).map(
            mapTaskRecord
          ),
      });
    } catch (error) {
      console.error(
        "❌ Activity stats error:",
        error
      );

      return res.status(500).json({
        success: false,

        msg:
          "Failed to load activity stats",
      });
    }
  }
);

// ============================================================
// POST /complete-work/:id
// ============================================================

router.post(
  "/complete-work/:id",

  upload.fields([
    {
      name: "files",
      maxCount: 20,
    },

    {
      name: "voice_notes",
      maxCount: 10,
    },

    {
      name: "voice_note",
      maxCount: 10,
    },
  ]),

  async (req, res) => {
    const taskId =
      Number(req.params.id);

    const mediaUploads =
      req.files?.files || [];

    const newVoiceUploads =
      req.files?.voice_notes || [];

    const oldVoiceUploads =
      req.files?.voice_note || [];

    const voiceUploads = [
      ...newVoiceUploads,
      ...oldVoiceUploads,
    ];

    const allUploadedFiles = [
      ...mediaUploads,
      ...voiceUploads,
    ];

    const userId =
      Number(req.body.user_id);

    const completionNote =
      req.body.completion_note !==
      undefined
        ? String(
            req.body.completion_note
          ).trim()
        : "";

    if (
      !Number.isInteger(taskId) ||
      taskId <= 0
    ) {
      await cleanupUploadedFiles(
        allUploadedFiles
      );

      return res.status(400).json({
        success: false,

        msg: "Invalid task ID",
      });
    }

    if (
      !Number.isInteger(userId) ||
      userId <= 0
    ) {
      await cleanupUploadedFiles(
        allUploadedFiles
      );

      return res.status(400).json({
        success: false,

        msg:
          "Valid user ID is required",
      });
    }

    const storedMediaFiles =
      toStoredFiles(mediaUploads);

    const storedVoiceNotes =
      toStoredFiles(voiceUploads);

    if (
      !completionNote &&
      !storedMediaFiles.length &&
      !storedVoiceNotes.length
    ) {
      await cleanupUploadedFiles(
        allUploadedFiles
      );

      return res.status(400).json({
        success: false,

        msg:
          "Please add a completion note, media file, or voice note before submitting work",
      });
    }

    let connection;

    let transactionStarted = false;

    try {
      connection =
        await promiseDb.getConnection();

      await connection.beginTransaction();

      transactionStarted = true;

      const [taskRows] =
        await connection.query(
          `
            SELECT
              id,
              title,
              status

            FROM tasks

            WHERE id = ?

            FOR UPDATE
          `,
          [taskId]
        );

      if (!taskRows.length) {
        await connection.rollback();

        transactionStarted = false;

        await cleanupUploadedFiles(
          allUploadedFiles
        );

        return res.status(404).json({
          success: false,

          msg: "Task not found",
        });
      }

      const task = taskRows[0];

      const [userRows] =
        await connection.query(
          `
            SELECT
              id,
              name

            FROM users

            WHERE id = ?

            LIMIT 1
          `,
          [userId]
        );

      if (!userRows.length) {
        await connection.rollback();

        transactionStarted = false;

        await cleanupUploadedFiles(
          allUploadedFiles
        );

        return res.status(404).json({
          success: false,

          msg: "User not found",
        });
      }

      const [assignmentRows] =
        await connection.query(
          `
            SELECT
              task_id,
              user_id

            FROM task_assignments

            WHERE task_id = ?
              AND user_id = ?

            LIMIT 1
          `,
          [taskId, userId]
        );

      if (!assignmentRows.length) {
        await connection.rollback();

        transactionStarted = false;

        await cleanupUploadedFiles(
          allUploadedFiles
        );

        return res.status(403).json({
          success: false,

          msg:
            "This user is not assigned to this task",
        });
      }

      const currentAssignment =
        await getLatestUserAssignment(
          connection,
          taskId,
          userId
        );

      if (!currentAssignment) {
        await connection.rollback();

        transactionStarted = false;

        await cleanupUploadedFiles(
          allUploadedFiles
        );

        return res.status(404).json({
          success: false,

          msg:
            "Current assignment cycle not found",
        });
      }

      if (
        currentAssignment.status !==
        "In Progress"
      ) {
        await connection.rollback();

        transactionStarted = false;

        await cleanupUploadedFiles(
          allUploadedFiles
        );

        return res.status(400).json({
          success: false,

          msg:
            currentAssignment.status ===
            "Completed"
              ? "This assignment cycle is already completed"
              : currentAssignment.status ===
                "Rejected"
              ? "This assignment cycle was rejected"
              : "Task must be accepted before submitting completion work",
        });
      }

      const mediaFilesJson =
        storedMediaFiles.length
          ? JSON.stringify(
              storedMediaFiles
            )
          : null;

      const voiceNotesJson =
        storedVoiceNotes.length
          ? JSON.stringify(
              storedVoiceNotes
            )
          : null;

      const primaryVoiceNotePath =
        storedVoiceNotes[0]?.path ||
        null;

      const [completionResult] =
        await connection.query(
          `
            INSERT INTO task_completions
            (
              task_id,
              user_id,
              completion_note,
              voice_note,
              voice_notes,
              media_files
            )
            VALUES
            (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?
            )
          `,
          [
            taskId,

            userId,

            completionNote || null,

            primaryVoiceNotePath,

            voiceNotesJson,

            mediaFilesJson,
          ]
        );

      await updateAssignmentHistoryStatus(
        connection,
        taskId,
        userId,
        "Completed"
      );

      const [currentAssignments] =
        await connection.query(
          `
            SELECT
              h.user_id,
              h.status

            FROM task_assignment_history h

            INNER JOIN (
              SELECT
                task_id,
                user_id,
                MAX(assignment_cycle)
                  AS max_cycle

              FROM task_assignment_history

              WHERE task_id = ?

              GROUP BY
                task_id,
                user_id
            ) latest

              ON h.task_id =
                latest.task_id

              AND h.user_id =
                latest.user_id

              AND h.assignment_cycle =
                latest.max_cycle

            INNER JOIN task_assignments ta

              ON ta.task_id = h.task_id

              AND ta.user_id = h.user_id

            WHERE h.task_id = ?
          `,
          [taskId, taskId]
        );

      const allCompleted =
        currentAssignments.length > 0 &&
        currentAssignments.every(
          (assignment) =>
            assignment.status ===
            "Completed"
        );

      const anyInProgress =
        currentAssignments.some(
          (assignment) =>
            assignment.status ===
            "In Progress"
        );

      const anyPending =
        currentAssignments.some(
          (assignment) =>
            assignment.status ===
            "Pending"
        );

      const allRejected =
        currentAssignments.length > 0 &&
        currentAssignments.every(
          (assignment) =>
            assignment.status ===
            "Rejected"
        );

      let overallStatus =
        "Pending";

      if (allCompleted) {
        overallStatus = "Completed";
      } else if (anyInProgress) {
        overallStatus = "In Progress";
      } else if (anyPending) {
        overallStatus = "Pending";
      } else if (allRejected) {
        overallStatus = "Rejected";
      }

      await connection.query(
        `
          UPDATE tasks

          SET
            status = ?,

            accepted_at =
              CASE
                WHEN ? IN (
                  'In Progress',
                  'Completed'
                )
                THEN
                  COALESCE(
                    accepted_at,
                    NOW()
                  )
                ELSE accepted_at
              END,

            completed_at =
              CASE
                WHEN ? = 'Completed'
                THEN NOW()
                ELSE NULL
              END,

            rejected_at =
              CASE
                WHEN ? = 'Rejected'
                THEN NOW()
                ELSE NULL
              END,

            rejection_reason =
              CASE
                WHEN ? = 'Rejected'
                THEN rejection_reason
                ELSE NULL
              END,

            updated_at = NOW()

          WHERE id = ?
        `,
        [
          overallStatus,
          overallStatus,
          overallStatus,
          overallStatus,
          overallStatus,
          taskId,
        ]
      );

      await connection.commit();

      transactionStarted = false;

      const updatedTask =
        await fetchCompleteTask(taskId);

      const recipients =
        await fetchTaskRecipients(
          taskId
        );

      try {
        const io =
          req.app.get("io");

        if (io) {
          io.emit("updateData");

          emitTaskEvent(
            io,
            recipients,
            "taskUpdate",
            {
              msg:
                "Task completion report submitted",

              status:
                overallStatus,

              completionId:
                completionResult.insertId,

              completedBy: userId,

              assignment_cycle:
                Number(
                  currentAssignment
                    .assignment_cycle
                ),
            }
          );
        }
      } catch (socketError) {
        console.error(
          "⚠️ Completion socket error:",
          socketError.message
        );
      }

      await sendPushNotification({
        userIds:
          recipients.map(
            (recipient) =>
              recipient.user_id
          ),

        title:
          "✅ Task Work Submitted",

        body:
          `${
            userRows[0].name ||
            "Staff member"
          } completed: ${task.title}`,

        taskId,

        type: "taskCompleted",
      });

      return res.status(201).json({
        success: true,

        msg:
          "Work completion report submitted successfully",

        taskId,

        completionId:
          completionResult.insertId,

        assignment_cycle:
          Number(
            currentAssignment
              .assignment_cycle
          ),

        task: updatedTask,

        completion:
          updatedTask?.latest_completion ||
          null,
      });
    } catch (error) {
      if (
        connection &&
        transactionStarted
      ) {
        try {
          await connection.rollback();
        } catch {}
      }

      await cleanupUploadedFiles(
        allUploadedFiles
      );

      console.error(
        "❌ Complete work error:",
        error
      );

      return res.status(500).json({
        success: false,

        msg:
          "Failed to submit work completion report",

        error:
          process.env.NODE_ENV ===
          "development"
            ? error.sqlMessage ||
              error.message
            : undefined,
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

// ============================================================
// GET /single/:id
// ============================================================

router.get(
  "/single/:id",

  async (req, res) => {
    try {
      const task =
        await fetchCompleteTask(
          req.params.id
        );

      if (!task) {
        return res.status(404).json({
          success: false,

          msg: "Task not found",
        });
      }

      return res.json({
        success: true,

        task,
      });
    } catch (error) {
      console.error(
        "❌ Single task fetch error:",
        error
      );

      return res.status(500).json({
        success: false,

        msg:
          "Failed to fetch task",
      });
    }
  }
);

// ============================================================
// PUT /update-status/:id
//
// Pending     -> User has not accepted
// In Progress -> User accepted
// Rejected    -> User rejected with reason
// Completed   -> Must use complete-work
// ============================================================

router.put(
  "/update-status/:id",

  async (req, res) => {
    const taskId =
      Number(req.params.id);

    const status =
      normalizeStatus(
        req.body.status
      );

    const userId =
      req.body.user_id !== undefined
        ? Number(req.body.user_id)
        : null;

    const rejectionReason =
      req.body.rejection_reason !==
      undefined
        ? String(
            req.body.rejection_reason
          ).trim()
        : "";

    if (
      !Number.isInteger(taskId) ||
      taskId <= 0
    ) {
      return res.status(400).json({
        success: false,

        msg: "Invalid task ID",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,

        msg:
          "Invalid status. Allowed: Pending, In Progress, Completed, Rejected",
      });
    }

    if (status === "Completed") {
      return res.status(400).json({
        success: false,

        msg:
          "Please use the Complete Work form to submit completion evidence before completing the task",
      });
    }

    if (
      status === "Rejected" &&
      !rejectionReason
    ) {
      return res.status(400).json({
        success: false,

        msg:
          "Rejection reason is required",
      });
    }

    if (
      userId !== null &&
      (
        !Number.isInteger(userId) ||
        userId <= 0
      )
    ) {
      return res.status(400).json({
        success: false,

        msg: "Invalid user ID",
      });
    }

    let connection;

    let transactionStarted = false;

    try {
      connection =
        await promiseDb.getConnection();

      await connection.beginTransaction();

      transactionStarted = true;

      const [existingRows] =
        await connection.query(
          `
            SELECT
              id,
              title,
              status

            FROM tasks

            WHERE id = ?

            FOR UPDATE
          `,
          [taskId]
        );

      if (!existingRows.length) {
        await connection.rollback();

        transactionStarted = false;

        return res.status(404).json({
          success: false,

          msg: "Task not found",
        });
      }

      if (userId) {
        const [assignmentRows] =
          await connection.query(
            `
              SELECT
                task_id,
                user_id

              FROM task_assignments

              WHERE task_id = ?
                AND user_id = ?

              LIMIT 1
            `,
            [taskId, userId]
          );

        if (!assignmentRows.length) {
          await connection.rollback();

          transactionStarted = false;

          return res.status(403).json({
            success: false,

            msg:
              "This user is not currently assigned to this task",
          });
        }
      }

      await updateAssignmentHistoryStatus(
        connection,
        taskId,
        userId,
        status,
        rejectionReason
      );

      const [currentAssignments] =
        await connection.query(
          `
            SELECT
              h.user_id,
              h.status,
              h.rejection_reason

            FROM task_assignment_history h

            INNER JOIN (
              SELECT
                task_id,
                user_id,
                MAX(assignment_cycle)
                  AS max_cycle

              FROM task_assignment_history

              WHERE task_id = ?

              GROUP BY
                task_id,
                user_id
            ) latest

              ON h.task_id =
                latest.task_id

              AND h.user_id =
                latest.user_id

              AND h.assignment_cycle =
                latest.max_cycle

            INNER JOIN task_assignments ta

              ON ta.task_id =
                h.task_id

              AND ta.user_id =
                h.user_id

            WHERE h.task_id = ?
          `,
          [taskId, taskId]
        );

      const allCompleted =
        currentAssignments.length > 0 &&
        currentAssignments.every(
          (item) =>
            item.status ===
            "Completed"
        );

      const anyInProgress =
        currentAssignments.some(
          (item) =>
            item.status ===
            "In Progress"
        );

      const anyPending =
        currentAssignments.some(
          (item) =>
            item.status ===
            "Pending"
        );

      const allRejected =
        currentAssignments.length > 0 &&
        currentAssignments.every(
          (item) =>
            item.status ===
            "Rejected"
        );

      let overallStatus = "Pending";

      if (allCompleted) {
        overallStatus = "Completed";
      } else if (anyInProgress) {
        overallStatus = "In Progress";
      } else if (anyPending) {
        overallStatus = "Pending";
      } else if (allRejected) {
        overallStatus = "Rejected";
      } else if (
        currentAssignments.some(
          (item) =>
            item.status ===
            "Rejected"
        )
      ) {
        overallStatus = "Rejected";
      }

      const firstRejection =
        currentAssignments.find(
          (item) =>
            item.status ===
            "Rejected" &&
            item.rejection_reason
        );

      await connection.query(
        `
          UPDATE tasks

          SET
            status = ?,

            accepted_at =
              CASE
                WHEN ? = 'In Progress'
                THEN
                  COALESCE(
                    accepted_at,
                    NOW()
                  )
                WHEN ? = 'Pending'
                THEN NULL
                ELSE accepted_at
              END,

            completed_at =
              CASE
                WHEN ? = 'Completed'
                THEN NOW()
                ELSE NULL
              END,

            rejected_at =
              CASE
                WHEN ? = 'Rejected'
                THEN NOW()
                ELSE NULL
              END,

            rejection_reason =
              CASE
                WHEN ? = 'Rejected'
                THEN ?
                ELSE NULL
              END,

            updated_at = NOW()

          WHERE id = ?
        `,
        [
          overallStatus,
          overallStatus,
          overallStatus,
          overallStatus,
          overallStatus,
          overallStatus,
          firstRejection?.rejection_reason ||
            null,
          taskId,
        ]
      );

      await connection.commit();

      transactionStarted = false;

      const recipients =
        await fetchTaskRecipients(
          taskId
        );

      const updatedTask =
        await fetchCompleteTask(
          taskId
        );

      try {
        const io =
          req.app.get("io");

        if (io) {
          io.emit("updateData");

          emitTaskEvent(
            io,
            recipients,
            "taskUpdate",
            {
              msg:
                `Task ${status}`,

              status,

              overall_status:
                overallStatus,

              user_id: userId,

              rejection_reason:
                status === "Rejected"
                  ? rejectionReason
                  : null,
            }
          );
        }
      } catch (socketError) {
        console.error(
          "⚠️ Socket error:",
          socketError.message
        );
      }

      await sendPushNotification({
        userIds:
          recipients.map(
            (recipient) =>
              recipient.user_id
          ),

        title:
          "Task Status Updated",

        body:
          `Task status changed to ${status}`,

        taskId,

        type:
          "taskStatusUpdate",
      });

      return res.json({
        success: true,

        msg:
          "Task status updated successfully",

        status,

        overall_status:
          overallStatus,

        task: updatedTask,
      });
    } catch (error) {
      if (
        connection &&
        transactionStarted
      ) {
        try {
          await connection.rollback();
        } catch {}
      }

      console.error(
        "❌ Status update error:",
        error
      );

      return res.status(500).json({
        success: false,

        msg:
          "Failed to update task status",

        error:
          process.env.NODE_ENV ===
          "development"
            ? error.sqlMessage ||
              error.message
            : undefined,
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

// ============================================================
// PUT /:id
// COMPLETE TASK UPDATE + REASSIGNMENT
//
// IMPORTANT BEHAVIOR:
//
// Completed task + same user selected again:
// Same Task ID
// New Cycle
// Pending
// Old history preserved
// Old completion reports preserved
//
// force_reassign=true can explicitly create a new cycle.
// ============================================================

router.put(
  "/:id",

  upload.array("files", 20),

  async (req, res) => {
    const taskId =
      Number(req.params.id);

    const uploadedFiles =
      req.files ||
      (
        req.file
          ? [req.file]
          : []
      );

    if (
      !Number.isInteger(taskId) ||
      taskId <= 0
    ) {
      await cleanupUploadedFiles(
        uploadedFiles
      );

      return res.status(400).json({
        success: false,

        msg: "Invalid task ID",
      });
    }

    const {
      title,
      description,
      category,
    } = req.body;

    const forceReassign =
      normalizeBoolean(
        req.body.force_reassign
      );

    let normalizedPriority;

    if (
      req.body.priority !== undefined
    ) {
      normalizedPriority =
        normalizePriority(
          req.body.priority
        );

      if (!normalizedPriority) {
        await cleanupUploadedFiles(
          uploadedFiles
        );

        return res.status(400).json({
          success: false,

          msg:
            "Invalid priority. Allowed: Low, Medium, High",
        });
      }
    }

    let normalizedStatus;

    if (
      req.body.status !== undefined
    ) {
      normalizedStatus =
        normalizeStatus(
          req.body.status
        );

      if (!normalizedStatus) {
        await cleanupUploadedFiles(
          uploadedFiles
        );

        return res.status(400).json({
          success: false,

          msg:
            "Invalid status. Allowed: Pending, In Progress, Completed, Rejected",
        });
      }
    }

    const hasPanelUpdate =
      Object.prototype.hasOwnProperty.call(
        req.body,
        "panel_id"
      );

    let panelId;

    if (hasPanelUpdate) {
      panelId =
        normalizePanelId(
          req.body.panel_id
        );

      if (panelId === false) {
        await cleanupUploadedFiles(
          uploadedFiles
        );

        return res.status(400).json({
          success: false,

          msg: "Invalid panel ID",
        });
      }
    }

    const hasAssignmentUpdate = [
      "user_id",
      "user_ids",
      "user_ids[]",
    ].some((key) =>
      Object.prototype.hasOwnProperty.call(
        req.body,
        key
      )
    );

    const userIds =
      hasAssignmentUpdate
        ? normalizeUserIds(req.body)
        : [];

    if (
      hasAssignmentUpdate &&
      !userIds.length
    ) {
      await cleanupUploadedFiles(
        uploadedFiles
      );

      return res.status(400).json({
        success: false,

        msg:
          "At least one assigned staff member is required",
      });
    }

    const removedFiles =
      normalizeStringArray(
        req.body.removedFiles,

        req.body.removed_files,

        req.body["removedFiles[]"]
      );

    const newFiles =
      toStoredFiles(uploadedFiles);

    const hasDueDateUpdate =
      Object.prototype.hasOwnProperty.call(
        req.body,
        "due_at"
      ) ||
      Object.prototype.hasOwnProperty.call(
        req.body,
        "due_date"
      );

    const dueAt =
      hasDueDateUpdate
        ? normalizeOptionalDate(
            req.body.due_at ??
            req.body.due_date
          )
        : null;

    if (dueAt === false) {
      await cleanupUploadedFiles(
        uploadedFiles
      );

      return res.status(400).json({
        success: false,

        msg: "Invalid due date",
      });
    }

    let connection;

    let transactionStarted = false;

    try {
      connection =
        await promiseDb.getConnection();

      await connection.beginTransaction();

      transactionStarted = true;

      const [rows] =
        await connection.query(
          `
            SELECT
              id,
              title,
              description,
              category,
              priority,
              file_url,
              panel_id,
              status,
              accepted_at,
              completed_at,
              rejected_at,
              rejection_reason

            FROM tasks

            WHERE id = ?

            FOR UPDATE
          `,
          [taskId]
        );

      if (!rows.length) {
        await connection.rollback();

        transactionStarted = false;

        await cleanupUploadedFiles(
          uploadedFiles
        );

        return res.status(404).json({
          success: false,

          msg: "Task not found",
        });
      }

      const oldTask = rows[0];

      let validatedUserIds = userIds;

      if (hasAssignmentUpdate) {
        const validation =
          await validateUserIds(
            connection,
            userIds
          );

        if (!validation.valid) {
          await connection.rollback();

          transactionStarted = false;

          await cleanupUploadedFiles(
            uploadedFiles
          );

          return res.status(400).json({
            success: false,

            msg:
              "One or more selected users do not exist",

            invalidUserIds:
              validation.invalidIds,
          });
        }

        validatedUserIds =
          validation.validIds;
      }

      if (hasPanelUpdate) {
        const panelValidation =
          await validatePanelId(
            connection,
            panelId
          );

        if (!panelValidation.valid) {
          await connection.rollback();

          transactionStarted = false;

          await cleanupUploadedFiles(
            uploadedFiles
          );

          return res.status(400).json({
            success: false,

            msg:
              `Panel with ID ${panelId} does not exist or is deleted`,
          });
        }
      }

      const [currentAssignmentRows] =
        await connection.query(
          `
            SELECT
              user_id

            FROM task_assignments

            WHERE task_id = ?

            ORDER BY user_id ASC
          `,
          [taskId]
        );

      const oldAssignedUserIds =
        currentAssignmentRows.map(
          (row) =>
            String(row.user_id)
        );

      const newAssignedUserIds =
        hasAssignmentUpdate
          ? validatedUserIds.map(
              (id) => String(id)
            )
          : oldAssignedUserIds;

      const sortedOldUsers = [
        ...oldAssignedUserIds,
      ].sort();

      const sortedNewUsers = [
        ...newAssignedUserIds,
      ].sort();

      const assignmentUsersChanged =
        JSON.stringify(sortedOldUsers) !==
        JSON.stringify(sortedNewUsers);

      const oldStatus =
        String(
          oldTask.status || ""
        )
          .trim()
          .toLowerCase();

      // ------------------------------------------------------
      // CRITICAL REASSIGNMENT LOGIC
      //
      // New cycle when:
      // 1. Admin explicitly sends force_reassign=true
      // 2. Assigned users changed
      // 3. Completed task is updated with assignment users
      // 4. Rejected task is updated with assignment users
      //
      // This fixes:
      // Completed -> Update -> Same User -> Pending
      // ------------------------------------------------------

      const shouldCreateNewCycle =
        forceReassign ||
        assignmentUsersChanged ||
        (
          hasAssignmentUpdate &&
          (
            oldStatus === "completed" ||
            oldStatus === "rejected"
          )
        );

      const oldFiles =
        parseStoredFiles(
          oldTask.file_url
        );

      const keptOldFiles =
        oldFiles.filter(
          (file) =>
            !removedFiles.includes(
              file.path
            )
        );

      const finalFiles = [
        ...keptOldFiles,
        ...newFiles,
      ];

      const fields = [];

      const values = [];

      if (title !== undefined) {
        if (!String(title).trim()) {
          await connection.rollback();

          transactionStarted = false;

          await cleanupUploadedFiles(
            uploadedFiles
          );

          return res.status(400).json({
            success: false,

            msg:
              "Task title cannot be empty",
          });
        }

        fields.push("title = ?");

        values.push(
          String(title).trim()
        );
      }

      if (description !== undefined) {
        fields.push(
          "description = ?"
        );

        values.push(description);
      }

      if (category !== undefined) {
        fields.push("category = ?");

        values.push(category);
      }

      if (hasPanelUpdate) {
        fields.push("panel_id = ?");

        values.push(panelId);
      }

      if (
        normalizedPriority !==
        undefined
      ) {
        fields.push("priority = ?");

        values.push(
          normalizedPriority
        );
      }

      if (
        newFiles.length > 0 ||
        removedFiles.length > 0
      ) {
        fields.push("file_url = ?");

        values.push(
          finalFiles.length
            ? JSON.stringify(
                finalFiles
              )
            : null
        );
      }

      // ------------------------------------------------------
      // IF REASSIGNED:
      // Always reset to Pending.
      // Ignore old Completed/Rejected status.
      // ------------------------------------------------------

      if (shouldCreateNewCycle) {
        fields.push(
          "status = 'Pending'"
        );

        fields.push(
          "accepted_at = NULL"
        );

        fields.push(
          "completed_at = NULL"
        );

        fields.push(
          "rejected_at = NULL"
        );

        fields.push(
          "rejection_reason = NULL"
        );
      } else if (
        normalizedStatus !== undefined
      ) {
        fields.push("status = ?");

        values.push(
          normalizedStatus
        );

        if (
          normalizedStatus ===
          "Pending"
        ) {
          fields.push(
            "accepted_at = NULL"
          );

          fields.push(
            "completed_at = NULL"
          );

          fields.push(
            "rejected_at = NULL"
          );

          fields.push(
            "rejection_reason = NULL"
          );
        }

        if (
          normalizedStatus ===
          "In Progress"
        ) {
          fields.push(
            "accepted_at = COALESCE(accepted_at, NOW())"
          );

          fields.push(
            "completed_at = NULL"
          );

          fields.push(
            "rejected_at = NULL"
          );

          fields.push(
            "rejection_reason = NULL"
          );
        }

        if (
          normalizedStatus ===
          "Completed"
        ) {
          fields.push(
            "accepted_at = COALESCE(accepted_at, NOW())"
          );

          fields.push(
            "completed_at = NOW()"
          );

          fields.push(
            "rejected_at = NULL"
          );

          fields.push(
            "rejection_reason = NULL"
          );
        }

        if (
          normalizedStatus ===
          "Rejected"
        ) {
          const rejectionReason =
            req.body.rejection_reason !==
            undefined
              ? String(
                  req.body.rejection_reason
                ).trim()
              : "";

          if (!rejectionReason) {
            await connection.rollback();

            transactionStarted = false;

            await cleanupUploadedFiles(
              uploadedFiles
            );

            return res.status(400).json({
              success: false,

              msg:
                "Rejection reason is required",
            });
          }

          fields.push(
            "rejected_at = NOW()"
          );

          fields.push(
            "rejection_reason = ?"
          );

          fields.push(
            "completed_at = NULL"
          );

          values.push(
            rejectionReason
          );
        }
      }

      if (fields.length > 0) {
        fields.push(
          "updated_at = NOW()"
        );
      }

      if (
        fields.length === 0 &&
        !hasAssignmentUpdate &&
        !forceReassign
      ) {
        await connection.rollback();

        transactionStarted = false;

        await cleanupUploadedFiles(
          uploadedFiles
        );

        const unchangedTask =
          await fetchCompleteTask(
            taskId
          );

        return res.json({
          success: true,

          msg: "Nothing to update",

          task: unchangedTask,
        });
      }

      if (fields.length > 0) {
        values.push(taskId);

        await connection.query(
          `
            UPDATE tasks

            SET ${fields.join(", ")}

            WHERE id = ?
          `,
          values
        );
      }

      let newAssignmentCycle = null;

      if (shouldCreateNewCycle) {
        newAssignmentCycle =
          await getNextAssignmentCycle(
            connection,
            taskId
          );

        await replaceAssignments(
          connection,
          taskId,
          newAssignedUserIds
        );

        await insertAssignmentHistory(
          connection,
          taskId,
          newAssignedUserIds,
          {
            assignmentCycle:
              newAssignmentCycle,

            status: "Pending",

            dueAt:
              hasDueDateUpdate
                ? dueAt
                : null,
          }
        );
      } else if (
        hasAssignmentUpdate &&
        assignmentUsersChanged
      ) {
        await replaceAssignments(
          connection,
          taskId,
          validatedUserIds
        );
      }

      if (
        !shouldCreateNewCycle &&
        normalizedStatus !== undefined
      ) {
        const rejectionReason =
          normalizedStatus ===
          "Rejected"
            ? String(
                req.body.rejection_reason ||
                ""
              ).trim()
            : null;

        await updateAssignmentHistoryStatus(
          connection,
          taskId,
          null,
          normalizedStatus,
          rejectionReason
        );
      }

      await connection.commit();

      transactionStarted = false;

      if (removedFiles.length) {
        await deleteStoredFiles(
          removedFiles
        );
      }

      const updatedTask =
        await fetchCompleteTask(
          taskId
        );

      const recipients =
        await fetchTaskRecipients(
          taskId
        );

      try {
        const io =
          req.app.get("io");

        if (io) {
          io.emit("updateData");

          if (shouldCreateNewCycle) {
            emitTaskEvent(
              io,
              recipients,
              "taskAssigned",
              {
                msg:
                  "Task Reassigned",

                status: "Pending",

                assignment_cycle:
                  newAssignmentCycle,

                repeat_count:
                  Math.max(
                    Number(
                      newAssignmentCycle
                    ) - 1,
                    0
                  ),
              }
            );

            emitTaskEvent(
              io,
              recipients,
              "taskReassigned",
              {
                msg:
                  "Task Reassigned",

                status: "Pending",

                assignment_cycle:
                  newAssignmentCycle,
              }
            );
          } else {
            emitTaskEvent(
              io,
              recipients,
              "taskUpdate",
              {
                msg: "Task Updated",

                status:
                  updatedTask?.status ||
                  oldTask.status,
              }
            );
          }
        }
      } catch (socketError) {
        console.error(
          "⚠️ Socket update error:",
          socketError.message
        );
      }

      if (shouldCreateNewCycle) {
        await sendPushNotification({
          userIds:
            newAssignedUserIds,

          title:
            "🔁 Task Reassigned",

          body:
            `Task assigned again: ${
              updatedTask?.title ||
              oldTask.title
            }`,

          taskId,

          type: "taskReassigned",
        });
      }

      return res.json({
        success: true,

        msg: shouldCreateNewCycle
          ? "Task updated and reassigned successfully"
          : "Task updated successfully",

        reassigned:
          shouldCreateNewCycle,

        assignment_cycle:
          newAssignmentCycle,

        repeat_count:
          newAssignmentCycle
            ? Math.max(
                Number(
                  newAssignmentCycle
                ) - 1,
                0
              )
            : updatedTask?.repeat_count ||
              0,

        task: updatedTask,
      });
    } catch (error) {
      if (
        connection &&
        transactionStarted
      ) {
        try {
          await connection.rollback();
        } catch {}
      }

      await cleanupUploadedFiles(
        uploadedFiles
      );

      console.error(
        "❌ Task update error:",
        error
      );

      return res.status(500).json({
        success: false,

        msg:
          "Failed to update task",

        error:
          process.env.NODE_ENV ===
          "development"
            ? error.sqlMessage ||
              error.message
            : undefined,
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

// ============================================================
// DELETE /:id
// ============================================================

router.delete(
  "/:id",

  async (req, res) => {
    const taskId =
      Number(req.params.id);

    if (
      !Number.isInteger(taskId) ||
      taskId <= 0
    ) {
      return res.status(400).json({
        success: false,

        msg: "Invalid task ID",
      });
    }

    let connection;

    let transactionStarted = false;

    let storedFiles = [];

    let completionStoredFiles = [];

    try {
      connection =
        await promiseDb.getConnection();

      await connection.beginTransaction();

      transactionStarted = true;

      const [rows] =
        await connection.query(
          `
            SELECT
              id,
              title,
              file_url,
              panel_id

            FROM tasks

            WHERE id = ?

            FOR UPDATE
          `,
          [taskId]
        );

      if (!rows.length) {
        await connection.rollback();

        transactionStarted = false;

        return res.status(404).json({
          success: false,

          msg: "Task not found",
        });
      }

      storedFiles =
        parseStoredFiles(
          rows[0].file_url
        ).map(
          (file) => file.path
        );

      const [completionRows] =
        await connection.query(
          `
            SELECT
              media_files,
              voice_note,
              voice_notes

            FROM task_completions

            WHERE task_id = ?
          `,
          [taskId]
        );

      completionStoredFiles = (
        completionRows || []
      ).flatMap(
        (completion) => [
          ...parseStoredFiles(
            completion.media_files
          ).map(
            (file) => file.path
          ),

          ...parseVoiceNotes(
            completion.voice_notes,
            completion.voice_note
          ).map(
            (file) => file.path
          ),
        ]
      );

      await connection.query(
        `
          DELETE FROM task_completions
          WHERE task_id = ?
        `,
        [taskId]
      );

      await connection.query(
        `
          DELETE FROM task_assignment_history
          WHERE task_id = ?
        `,
        [taskId]
      );

      await connection.query(
        `
          DELETE FROM task_assignments
          WHERE task_id = ?
        `,
        [taskId]
      );

      await connection.query(
        `
          DELETE FROM tasks
          WHERE id = ?
        `,
        [taskId]
      );

      await connection.commit();

      transactionStarted = false;

      await deleteStoredFiles([
        ...storedFiles,

        ...completionStoredFiles,
      ]);

      try {
        const io =
          req.app.get("io");

        if (io) {
          io.emit("updateData");

          io.emit("taskDeleted", {
            taskId,

            panel_id:
              rows[0].panel_id ||
              null,

            time: new Date(),
          });
        }
      } catch (socketError) {
        console.error(
          "⚠️ Socket delete error:",
          socketError.message
        );
      }

      return res.json({
        success: true,

        msg:
          "Task deleted successfully",

        taskId,
      });
    } catch (error) {
      if (
        connection &&
        transactionStarted
      ) {
        try {
          await connection.rollback();
        } catch {}
      }

      console.error(
        "❌ Task delete error:",
        error
      );

      return res.status(500).json({
        success: false,

        msg:
          "Failed to delete task",

        error:
          process.env.NODE_ENV ===
          "development"
            ? error.sqlMessage ||
              error.message
            : undefined,
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

// ============================================================
// GET /:id
// IMPORTANT: KEEP DYNAMIC ROUTE LAST
// ============================================================

router.get(
  "/:id",

  async (req, res) => {
    try {
      const task =
        await fetchCompleteTask(
          req.params.id
        );

      if (!task) {
        return res.status(404).json({
          success: false,

          msg: "Task not found",
        });
      }

      return res.json({
        success: true,

        task,
      });
    } catch (error) {
      console.error(
        "❌ Task fetch error:",
        error
      );

      return res.status(500).json({
        success: false,

        msg:
          "Failed to fetch task",

        error:
          process.env.NODE_ENV ===
          "development"
            ? error.sqlMessage ||
              error.message
            : undefined,
      });
    }
  }
);

// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;