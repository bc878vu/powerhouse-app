const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ============================================================
// HELPER: PROMISE MYSQL QUERY
// Supports mysql2 callback-style connection
// ============================================================

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(results);
    });
  });
}

// ============================================================
// HELPER: VALID POSITIVE INTEGER
// ============================================================

function toPositiveInteger(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

// ============================================================
// HELPER: VALID YEAR
// ============================================================

function getSafeYear(value) {
  const currentYear = new Date().getFullYear();
  const year = Number(value);

  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2200
  ) {
    return currentYear;
  }

  return year;
}

// ============================================================
// HELPER: VALID MONTH
// ============================================================

function getSafeMonth(value) {
  const currentMonth = new Date().getMonth() + 1;
  const month = Number(value);

  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return currentMonth;
  }

  return month;
}

// ============================================================
// HELPER: MYSQL DATE YYYY-MM-DD
// ============================================================

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// ============================================================
// HELPER: NORMALIZE DATE
// ============================================================

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const stringValue = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    return stringValue;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return getLocalDateString(date);
}

// ============================================================
// HELPER: NORMALIZE TIME
// Supports HH:MM and HH:MM:SS
// ============================================================

function normalizeTime(value) {
  if (!value) {
    return null;
  }

  const time = String(value).trim();

  if (/^\d{2}:\d{2}$/.test(time)) {
    return `${time}:00`;
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(time)) {
    return time;
  }

  return null;
}

// ============================================================
// HELPER: VALID DUTY STATUS
// ============================================================

function normalizeDutyStatus(value) {
  const status = String(value || "")
    .trim()
    .toLowerCase();

  const allowed = [
    "on_duty",
    "off_duty",
    "leave",
  ];

  if (!allowed.includes(status)) {
    return null;
  }

  return status;
}

// ============================================================
// HELPER: USER EXISTS
// ============================================================

async function getUserById(userId) {
  const rows = await query(
    `
      SELECT
        id,
        name,
        email,
        phone,
        role,
        profile_pic
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
}

// ============================================================
// HELPER: GET CURRENT ACTIVE SHIFT
// ============================================================

async function getCurrentShift(userId) {
  const rows = await query(
    `
      SELECT
        id,
        user_id,
        shift_name,
        start_time,
        end_time,
        effective_from,
        effective_to,
        is_active,
        notes,
        created_at,
        updated_at
      FROM staff_shifts
      WHERE user_id = ?
        AND is_active = 1
      ORDER BY
        effective_from DESC,
        id DESC
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
}

// ============================================================
// HELPER: GET TODAY DUTY RECORD
// ============================================================

async function getTodayDuty(userId) {
  const rows = await query(
    `
      SELECT
        id,
        user_id,
        DATE_FORMAT(duty_date, '%Y-%m-%d') AS duty_date,
        shift_name,
        start_time,
        end_time,
        status,
        notes,
        created_at,
        updated_at
      FROM staff_duties
      WHERE user_id = ?
        AND duty_date = CURDATE()
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
}

// ============================================================
// GET /api/duty/summary
//
// Dashboard summary for today
// ============================================================

router.get("/summary", async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        (
          SELECT COUNT(*)
          FROM users
          WHERE role != 'superadmin'
        ) AS totalStaff,

        (
          SELECT COUNT(*)
          FROM staff_duties
          WHERE duty_date = CURDATE()
            AND status = 'on_duty'
        ) AS onDutyToday,

        (
          SELECT COUNT(*)
          FROM staff_duties
          WHERE duty_date = CURDATE()
            AND status = 'leave'
        ) AS onLeaveToday,

        (
          SELECT COUNT(*)
          FROM staff_duties
          WHERE duty_date = CURDATE()
            AND status = 'off_duty'
        ) AS offToday
    `);

    const result = rows[0] || {};

    return res.json({
      success: true,

      totalStaff: Number(result.totalStaff || 0),

      onDutyToday: Number(
        result.onDutyToday || 0
      ),

      onLeaveToday: Number(
        result.onLeaveToday || 0
      ),

      offToday: Number(
        result.offToday || 0
      ),
    });
  } catch (err) {
    console.error(
      "❌ DUTY SUMMARY ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load duty summary.",
      error: err.sqlMessage || err.message,
    });
  }
});

// ============================================================
// GET /api/duty/staff?year=2026&month=7
//
// Returns all staff with:
// - current shift
// - today's duty status
// - monthly counts
// ============================================================

router.get("/staff", async (req, res) => {
  try {
    const year = getSafeYear(req.query.year);
    const month = getSafeMonth(req.query.month);

    const rows = await query(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          u.phone,
          u.role,
          u.profile_pic,

          ss.id AS shift_id,
          ss.shift_name AS current_shift_name,
          ss.start_time AS current_start_time,
          ss.end_time AS current_end_time,
          ss.effective_from,
          ss.effective_to,
          ss.notes AS shift_notes,

          todayDuty.id AS today_duty_id,
          DATE_FORMAT(
            todayDuty.duty_date,
            '%Y-%m-%d'
          ) AS today_duty_date,

          todayDuty.status AS today_status,

          todayDuty.shift_name
            AS today_shift_name,

          todayDuty.start_time
            AS today_start_time,

          todayDuty.end_time
            AS today_end_time,

          todayDuty.notes
            AS today_notes,

          COALESCE(monthly.duty_days, 0)
            AS duty_days,

          COALESCE(monthly.leave_days, 0)
            AS leave_days,

          COALESCE(monthly.off_days, 0)
            AS off_days,

          COALESCE(monthly.recorded_days, 0)
            AS recorded_days

        FROM users u

        LEFT JOIN staff_shifts ss
          ON ss.id = (
            SELECT s2.id
            FROM staff_shifts s2
            WHERE s2.user_id = u.id
              AND s2.is_active = 1
            ORDER BY
              s2.effective_from DESC,
              s2.id DESC
            LIMIT 1
          )

        LEFT JOIN staff_duties todayDuty
          ON todayDuty.user_id = u.id
          AND todayDuty.duty_date = CURDATE()

        LEFT JOIN (
          SELECT
            user_id,

            SUM(
              CASE
                WHEN status = 'on_duty'
                THEN 1
                ELSE 0
              END
            ) AS duty_days,

            SUM(
              CASE
                WHEN status = 'leave'
                THEN 1
                ELSE 0
              END
            ) AS leave_days,

            SUM(
              CASE
                WHEN status = 'off_duty'
                THEN 1
                ELSE 0
              END
            ) AS off_days,

            COUNT(*) AS recorded_days

          FROM staff_duties

          WHERE YEAR(duty_date) = ?
            AND MONTH(duty_date) = ?

          GROUP BY user_id
        ) monthly
          ON monthly.user_id = u.id

        WHERE u.role != 'superadmin'

        ORDER BY
          u.name ASC,
          u.id ASC
      `,
      [year, month]
    );

    const staff = rows.map((row) => ({
      id: Number(row.id),

      name: row.name || "",

      email: row.email || "",

      phone: row.phone || "",

      role: row.role || "user",

      profile_pic: row.profile_pic || null,

      currentShift: row.shift_id
        ? {
            id: Number(row.shift_id),

            shift_name:
              row.current_shift_name || "",

            start_time:
              row.current_start_time || null,

            end_time:
              row.current_end_time || null,

            effective_from:
              row.effective_from || null,

            effective_to:
              row.effective_to || null,

            notes:
              row.shift_notes || "",
          }
        : null,

      todayDuty: row.today_duty_id
        ? {
            id: Number(row.today_duty_id),

            duty_date:
              row.today_duty_date || null,

            status:
              row.today_status || null,

            shift_name:
              row.today_shift_name || null,

            start_time:
              row.today_start_time || null,

            end_time:
              row.today_end_time || null,

            notes:
              row.today_notes || "",
          }
        : null,

      monthlySummary: {
        dutyDays: Number(row.duty_days || 0),

        leaveDays: Number(
          row.leave_days || 0
        ),

        offDays: Number(row.off_days || 0),

        recordedDays: Number(
          row.recorded_days || 0
        ),
      },
    }));

    return res.json({
      success: true,
      year,
      month,
      total: staff.length,
      staff,
    });
  } catch (err) {
    console.error(
      "❌ GET DUTY STAFF ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load staff duty records.",
      error: err.sqlMessage || err.message,
    });
  }
});

// ============================================================
// GET /api/duty/user/:userId
//
// Full individual staff duty information
// ============================================================

router.get("/user/:userId", async (req, res) => {
  try {
    const userId = toPositiveInteger(
      req.params.userId
    );

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const user = await getUserById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const currentShift = await getCurrentShift(
      userId
    );

    const todayDuty = await getTodayDuty(userId);

    const recentHistory = await query(
      `
        SELECT
          id,
          user_id,

          DATE_FORMAT(
            duty_date,
            '%Y-%m-%d'
          ) AS duty_date,

          shift_name,
          start_time,
          end_time,
          status,
          notes,
          created_at,
          updated_at

        FROM staff_duties

        WHERE user_id = ?

        ORDER BY
          duty_date DESC,
          id DESC

        LIMIT 30
      `,
      [userId]
    );

    return res.json({
      success: true,
      user,
      currentShift,
      todayDuty,
      recentHistory,
    });
  } catch (err) {
    console.error(
      "❌ GET USER DUTY ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load user duty information.",
      error: err.sqlMessage || err.message,
    });
  }
});

// ============================================================
// GET /api/duty/user/:userId/monthly
//
// Example:
// /api/duty/user/5/monthly?year=2026&month=7
// ============================================================

router.get(
  "/user/:userId/monthly",
  async (req, res) => {
    try {
      const userId = toPositiveInteger(
        req.params.userId
      );

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID.",
        });
      }

      const year = getSafeYear(req.query.year);
      const month = getSafeMonth(
        req.query.month
      );

      const user = await getUserById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      const currentShift =
        await getCurrentShift(userId);

      const todayDuty = await getTodayDuty(userId);

      const summaryRows = await query(
        `
          SELECT
            COUNT(*) AS recordedDays,

            SUM(
              CASE
                WHEN status = 'on_duty'
                THEN 1
                ELSE 0
              END
            ) AS dutyDays,

            SUM(
              CASE
                WHEN status = 'leave'
                THEN 1
                ELSE 0
              END
            ) AS leaveDays,

            SUM(
              CASE
                WHEN status = 'off_duty'
                THEN 1
                ELSE 0
              END
            ) AS offDays

          FROM staff_duties

          WHERE user_id = ?
            AND YEAR(duty_date) = ?
            AND MONTH(duty_date) = ?
        `,
        [userId, year, month]
      );

      const records = await query(
        `
          SELECT
            id,
            user_id,

            DATE_FORMAT(
              duty_date,
              '%Y-%m-%d'
            ) AS duty_date,

            shift_name,
            start_time,
            end_time,
            status,
            notes,
            created_at,
            updated_at

          FROM staff_duties

          WHERE user_id = ?
            AND YEAR(duty_date) = ?
            AND MONTH(duty_date) = ?

          ORDER BY
            duty_date DESC,
            id DESC
        `,
        [userId, year, month]
      );

      const summary = summaryRows[0] || {};

      return res.json({
        success: true,

        year,

        month,

        user,

        currentShift,

        todayDuty,

        summary: {
          recordedDays: Number(
            summary.recordedDays || 0
          ),

          dutyDays: Number(
            summary.dutyDays || 0
          ),

          leaveDays: Number(
            summary.leaveDays || 0
          ),

          offDays: Number(
            summary.offDays || 0
          ),
        },

        records,
      });
    } catch (err) {
      console.error(
        "❌ MONTHLY DUTY ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to load monthly duty report.",
        error: err.sqlMessage || err.message,
      });
    }
  }
);

// ============================================================
// GET /api/duty/user/:userId/history
//
// Complete shift + duty history
// ============================================================

router.get(
  "/user/:userId/history",
  async (req, res) => {
    try {
      const userId = toPositiveInteger(
        req.params.userId
      );

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID.",
        });
      }

      const user = await getUserById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      const shifts = await query(
        `
          SELECT
            id,
            user_id,
            shift_name,
            start_time,
            end_time,
            effective_from,
            effective_to,
            is_active,
            notes,
            created_at,
            updated_at

          FROM staff_shifts

          WHERE user_id = ?

          ORDER BY
            effective_from DESC,
            id DESC
        `,
        [userId]
      );

      const duties = await query(
        `
          SELECT
            id,
            user_id,

            DATE_FORMAT(
              duty_date,
              '%Y-%m-%d'
            ) AS duty_date,

            shift_name,
            start_time,
            end_time,
            status,
            notes,
            created_at,
            updated_at

          FROM staff_duties

          WHERE user_id = ?

          ORDER BY
            duty_date DESC,
            id DESC
        `,
        [userId]
      );

      return res.json({
        success: true,
        user,
        shifts,
        duties,
      });
    } catch (err) {
      console.error(
        "❌ DUTY HISTORY ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to load duty history.",
        error: err.sqlMessage || err.message,
      });
    }
  }
);

// ============================================================
// POST /api/duty/assign-shift
//
// Body:
// {
//   user_id: 5,
//   shift_name: "Morning Shift",
//   start_time: "08:00",
//   end_time: "16:00",
//   effective_from: "2026-07-13",
//   notes: "Optional"
// }
// ============================================================

router.post(
  "/assign-shift",
  async (req, res) => {
    try {
      const userId = toPositiveInteger(
        req.body.user_id
      );

      const shiftName = String(
        req.body.shift_name || ""
      ).trim();

      const startTime = normalizeTime(
        req.body.start_time
      );

      const endTime = normalizeTime(
        req.body.end_time
      );

      const effectiveFrom = normalizeDate(
        req.body.effective_from
      );

      const notes = String(
        req.body.notes || ""
      ).trim();

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "Valid user ID is required.",
        });
      }

      if (!shiftName) {
        return res.status(400).json({
          success: false,
          message: "Shift name is required.",
        });
      }

      if (!startTime || !endTime) {
        return res.status(400).json({
          success: false,
          message:
            "Valid start time and end time are required.",
        });
      }

      if (!effectiveFrom) {
        return res.status(400).json({
          success: false,
          message:
            "Valid effective-from date is required.",
        });
      }

      const user = await getUserById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      // Close previous active shift one day
      // before new shift begins.

      await query(
        `
          UPDATE staff_shifts

          SET
            is_active = 0,

            effective_to =
              DATE_SUB(?, INTERVAL 1 DAY)

          WHERE user_id = ?
            AND is_active = 1
        `,
        [effectiveFrom, userId]
      );

      const result = await query(
        `
          INSERT INTO staff_shifts
          (
            user_id,
            shift_name,
            start_time,
            end_time,
            effective_from,
            effective_to,
            is_active,
            notes
          )
          VALUES (?, ?, ?, ?, ?, NULL, 1, ?)
        `,
        [
          userId,
          shiftName,
          startTime,
          endTime,
          effectiveFrom,
          notes || null,
        ]
      );

      const newShift = await getCurrentShift(
        userId
      );

      return res.status(201).json({
        success: true,

        message:
          "Shift assigned successfully.",

        shiftId: result.insertId,

        shift: newShift,
      });
    } catch (err) {
      console.error(
        "❌ ASSIGN SHIFT ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        message: "Failed to assign shift.",
        error: err.sqlMessage || err.message,
      });
    }
  }
);

// ============================================================
// PUT /api/duty/shift/:id
//
// Update a shift history record
// ============================================================

router.put("/shift/:id", async (req, res) => {
  try {
    const shiftId = toPositiveInteger(
      req.params.id
    );

    if (!shiftId) {
      return res.status(400).json({
        success: false,
        message: "Invalid shift ID.",
      });
    }

    const existingRows = await query(
      `
        SELECT *
        FROM staff_shifts
        WHERE id = ?
        LIMIT 1
      `,
      [shiftId]
    );

    const existing = existingRows[0];

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Shift not found.",
      });
    }

    const shiftName = String(
      req.body.shift_name ??
        existing.shift_name ??
        ""
    ).trim();

    const startTime = normalizeTime(
      req.body.start_time ??
        existing.start_time
    );

    const endTime = normalizeTime(
      req.body.end_time ??
        existing.end_time
    );

    const effectiveFrom = normalizeDate(
      req.body.effective_from ??
        existing.effective_from
    );

    const effectiveTo =
      req.body.effective_to === "" ||
      req.body.effective_to === null
        ? null
        : normalizeDate(
            req.body.effective_to ??
              existing.effective_to
          );

    const isActive =
      req.body.is_active !== undefined
        ? Number(req.body.is_active) === 1
          ? 1
          : 0
        : Number(existing.is_active) === 1
        ? 1
        : 0;

    const notes = String(
      req.body.notes ??
        existing.notes ??
        ""
    ).trim();

    if (
      !shiftName ||
      !startTime ||
      !endTime ||
      !effectiveFrom
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Shift name, times and effective date are required.",
      });
    }

    if (isActive === 1) {
      await query(
        `
          UPDATE staff_shifts
          SET is_active = 0
          WHERE user_id = ?
            AND id != ?
        `,
        [existing.user_id, shiftId]
      );
    }

    await query(
      `
        UPDATE staff_shifts

        SET
          shift_name = ?,
          start_time = ?,
          end_time = ?,
          effective_from = ?,
          effective_to = ?,
          is_active = ?,
          notes = ?

        WHERE id = ?
      `,
      [
        shiftName,
        startTime,
        endTime,
        effectiveFrom,
        effectiveTo,
        isActive,
        notes || null,
        shiftId,
      ]
    );

    const updatedRows = await query(
      `
        SELECT *
        FROM staff_shifts
        WHERE id = ?
        LIMIT 1
      `,
      [shiftId]
    );

    return res.json({
      success: true,

      message:
        "Shift updated successfully.",

      shift: updatedRows[0] || null,
    });
  } catch (err) {
    console.error(
      "❌ UPDATE SHIFT ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update shift.",
      error: err.sqlMessage || err.message,
    });
  }
});

// ============================================================
// POST /api/duty/mark-status
//
// Creates or updates one duty record for one date.
//
// Body:
// {
//   user_id: 5,
//   duty_date: "2026-07-13",
//   status: "on_duty",
//   notes: "Optional"
// }
// ============================================================

router.post(
  "/mark-status",
  async (req, res) => {
    try {
      const userId = toPositiveInteger(
        req.body.user_id
      );

      const dutyDate = normalizeDate(
        req.body.duty_date
      );

      const status = normalizeDutyStatus(
        req.body.status
      );

      const notes = String(
        req.body.notes || ""
      ).trim();

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "Valid user ID is required.",
        });
      }

      if (!dutyDate) {
        return res.status(400).json({
          success: false,
          message: "Valid duty date is required.",
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,

          message:
            "Status must be on_duty, off_duty or leave.",
        });
      }

      const user = await getUserById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      const currentShift =
        await getCurrentShift(userId);

      const shiftName =
        String(
          req.body.shift_name ||
            currentShift?.shift_name ||
            ""
        ).trim() || null;

      const startTime =
        normalizeTime(req.body.start_time) ||
        normalizeTime(
          currentShift?.start_time
        );

      const endTime =
        normalizeTime(req.body.end_time) ||
        normalizeTime(
          currentShift?.end_time
        );

      await query(
        `
          INSERT INTO staff_duties
          (
            user_id,
            duty_date,
            shift_name,
            start_time,
            end_time,
            status,
            notes
          )

          VALUES (?, ?, ?, ?, ?, ?, ?)

          ON DUPLICATE KEY UPDATE

            shift_name = VALUES(shift_name),

            start_time = VALUES(start_time),

            end_time = VALUES(end_time),

            status = VALUES(status),

            notes = VALUES(notes),

            updated_at = CURRENT_TIMESTAMP
        `,
        [
          userId,
          dutyDate,
          shiftName,
          startTime,
          endTime,
          status,
          notes || null,
        ]
      );

      const savedRows = await query(
        `
          SELECT
            id,
            user_id,

            DATE_FORMAT(
              duty_date,
              '%Y-%m-%d'
            ) AS duty_date,

            shift_name,
            start_time,
            end_time,
            status,
            notes,
            created_at,
            updated_at

          FROM staff_duties

          WHERE user_id = ?
            AND duty_date = ?

          LIMIT 1
        `,
        [userId, dutyDate]
      );

      return res.json({
        success: true,

        message:
          "Duty status saved successfully.",

        duty: savedRows[0] || null,
      });
    } catch (err) {
      console.error(
        "❌ MARK DUTY STATUS ERROR:",
        err
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to save duty status.",

        error: err.sqlMessage || err.message,
      });
    }
  }
);

// ============================================================
// PUT /api/duty/record/:id
//
// Update existing duty record
// ============================================================

router.put("/record/:id", async (req, res) => {
  try {
    const recordId = toPositiveInteger(
      req.params.id
    );

    if (!recordId) {
      return res.status(400).json({
        success: false,
        message: "Invalid duty record ID.",
      });
    }

    const rows = await query(
      `
        SELECT *
        FROM staff_duties
        WHERE id = ?
        LIMIT 1
      `,
      [recordId]
    );

    const existing = rows[0];

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Duty record not found.",
      });
    }

    const dutyDate = normalizeDate(
      req.body.duty_date ??
        existing.duty_date
    );

    const status = normalizeDutyStatus(
      req.body.status ??
        existing.status
    );

    const shiftName =
      String(
        req.body.shift_name ??
          existing.shift_name ??
          ""
      ).trim() || null;

    const startTime =
      normalizeTime(
        req.body.start_time ??
          existing.start_time
      ) || null;

    const endTime =
      normalizeTime(
        req.body.end_time ??
          existing.end_time
      ) || null;

    const notes =
      String(
        req.body.notes ??
          existing.notes ??
          ""
      ).trim() || null;

    if (!dutyDate || !status) {
      return res.status(400).json({
        success: false,
        message:
          "Valid duty date and status are required.",
      });
    }

    await query(
      `
        UPDATE staff_duties

        SET
          duty_date = ?,
          shift_name = ?,
          start_time = ?,
          end_time = ?,
          status = ?,
          notes = ?

        WHERE id = ?
      `,
      [
        dutyDate,
        shiftName,
        startTime,
        endTime,
        status,
        notes,
        recordId,
      ]
    );

    const updatedRows = await query(
      `
        SELECT
          id,
          user_id,

          DATE_FORMAT(
            duty_date,
            '%Y-%m-%d'
          ) AS duty_date,

          shift_name,
          start_time,
          end_time,
          status,
          notes,
          created_at,
          updated_at

        FROM staff_duties

        WHERE id = ?

        LIMIT 1
      `,
      [recordId]
    );

    return res.json({
      success: true,

      message:
        "Duty record updated successfully.",

      duty: updatedRows[0] || null,
    });
  } catch (err) {
    console.error(
      "❌ UPDATE DUTY RECORD ERROR:",
      err
    );

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,

        message:
          "A duty record already exists for this user on this date.",
      });
    }

    return res.status(500).json({
      success: false,

      message:
        "Failed to update duty record.",

      error: err.sqlMessage || err.message,
    });
  }
});

// ============================================================
// DELETE /api/duty/record/:id
// ============================================================

router.delete(
  "/record/:id",
  async (req, res) => {
    try {
      const recordId = toPositiveInteger(
        req.params.id
      );

      if (!recordId) {
        return res.status(400).json({
          success: false,
          message: "Invalid duty record ID.",
        });
      }

      const result = await query(
        `
          DELETE FROM staff_duties
          WHERE id = ?
        `,
        [recordId]
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message: "Duty record not found.",
        });
      }

      return res.json({
        success: true,

        message:
          "Duty record deleted successfully.",
      });
    } catch (err) {
      console.error(
        "❌ DELETE DUTY RECORD ERROR:",
        err
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to delete duty record.",

        error: err.sqlMessage || err.message,
      });
    }
  }
);

module.exports = router;