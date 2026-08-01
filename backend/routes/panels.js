const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ==========================================================
// HELPER: PROMISE WRAPPER FOR MYSQL CALLBACK POOL
// ==========================================================
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
};

// ==========================================================
// HELPER: SAFE SOCKET.IO EVENT
// ==========================================================
const emitEvent = (req, eventName, data) => {
  try {
    const io = req.app.get("io");
    if (io) io.emit(eventName, data);
  } catch (error) {
    console.error(`SOCKET EMIT ERROR [${eventName}]:`, error.message);
  }
};

// ==========================================================
// HELPER: PARSE ROUTE POINTS
// ==========================================================
const parseRoutePoints = (routePoints) => {
  if (!routePoints) return [];
  if (Array.isArray(routePoints)) return routePoints;

  try {
    const parsed = JSON.parse(routePoints);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

// ==========================================================
// HELPER: NORMALIZE NULL VALUE
// ==========================================================
const nullable = (value) => {
  if (value === undefined || value === null || value === "") return null;
  return value;
};

// ==========================================================
// HELPER: VALIDATE POSITIVE INTEGER ID
// ==========================================================
const isValidId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0;
};

// ==========================================================
// HELPER: VALIDATE STATUS
// ==========================================================
const VALID_STATUSES = ["live", "off", "maintenance"];

// ==========================================================
// HELPER: GET PANEL BY ID
// includeDeleted=false => only active panels
// includeDeleted=true  => active or deleted panels
// ==========================================================
const getPanelById = async (panelId, includeDeleted = false) => {
  const deletedCondition = includeDeleted ? "" : "AND p.is_deleted = 0";

  const rows = await query(
    `
    SELECT
      p.*,
      source.panel_code AS source_panel_code,
      source.panel_name AS source_panel_name
    FROM panels p
    LEFT JOIN panels source
      ON p.source_panel_id = source.id
    WHERE p.id = ?
      ${deletedCondition}
    LIMIT 1
    `,
    [panelId]
  );

  return rows[0] || null;
};

// ==========================================================
// HELPER: GET ROUTE BY ID
// Only active source/destination panels are valid.
// ==========================================================
const getRouteById = async (routeId) => {
  const rows = await query(
    `
    SELECT
      cr.*,
      source.panel_code AS source_panel_code,
      source.panel_name AS source_panel_name,
      destination.panel_code AS destination_panel_code,
      destination.panel_name AS destination_panel_name
    FROM cable_routes cr
    LEFT JOIN panels source
      ON cr.source_panel_id = source.id
    LEFT JOIN panels destination
      ON cr.destination_panel_id = destination.id
    WHERE cr.id = ?
      AND source.is_deleted = 0
      AND destination.is_deleted = 0
    LIMIT 1
    `,
    [routeId]
  );

  if (!rows.length) return null;

  return {
    ...rows[0],
    route_points: parseRoutePoints(rows[0].route_points)
  };
};

// ==========================================================
// GET DASHBOARD PANEL SUMMARY
// GET /api/panels/dashboard/summary
// IMPORTANT: MUST STAY ABOVE /:id
// ==========================================================
router.get("/dashboard/summary", async (req, res) => {
  try {
    const panelStats = await query(`
      SELECT
        COUNT(*) AS total_panels,
        SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) AS live_panels,
        SUM(CASE WHEN status = 'off' THEN 1 ELSE 0 END) AS off_panels,
        SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) AS maintenance_panels
      FROM panels
      WHERE is_deleted = 0
    `);

    const routeStats = await query(`
      SELECT COUNT(*) AS total_routes
      FROM cable_routes cr
      INNER JOIN panels source
        ON cr.source_panel_id = source.id
        AND source.is_deleted = 0
      INNER JOIN panels destination
        ON cr.destination_panel_id = destination.id
        AND destination.is_deleted = 0
    `);

    const deletedStats = await query(`
      SELECT COUNT(*) AS deleted_panels
      FROM panels
      WHERE is_deleted = 1
    `);

    const totalPanels = Number(panelStats[0]?.total_panels || 0);
    const livePanels = Number(panelStats[0]?.live_panels || 0);
    const offPanels = Number(panelStats[0]?.off_panels || 0);
    const maintenancePanels = Number(
      panelStats[0]?.maintenance_panels || 0
    );
    const totalRoutes = Number(routeStats[0]?.total_routes || 0);
    const deletedPanels = Number(deletedStats[0]?.deleted_panels || 0);

    const networkHealth =
      totalPanels > 0
        ? Number(((livePanels / totalPanels) * 100).toFixed(2))
        : 100;

    res.status(200).json({
      success: true,
      summary: {
        total_panels: totalPanels,
        live_panels: livePanels,
        off_panels: offPanels,
        maintenance_panels: maintenancePanels,
        deleted_panels: deletedPanels,
        total_routes: totalRoutes,
        network_health: networkHealth
      }
    });
  } catch (error) {
    console.error("DASHBOARD PANEL SUMMARY ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard panel summary",
      error: error.message
    });
  }
});

// ==========================================================
// GET COMPLETE NETWORK STATUS
// GET /api/panels/network/status
//
// effective_status:
// live        = panel and all upstream supplies are live
// off         = panel itself is off
// maintenance = panel itself is under maintenance
// affected    = upstream/main supply is not live
//
// Deleted panels are completely hidden.
// IMPORTANT: MUST STAY ABOVE /:id
// ==========================================================
router.get("/network/status", async (req, res) => {
  try {
    const panels = await query(`
      SELECT
        p.*,
        source.panel_code AS source_panel_code,
        source.panel_name AS source_panel_name,
        source.status AS source_panel_status
      FROM panels p
      LEFT JOIN panels source
        ON p.source_panel_id = source.id
        AND source.is_deleted = 0
      WHERE p.is_deleted = 0
      ORDER BY p.id ASC
    `);

    const panelMap = new Map(
      panels.map((panel) => [Number(panel.id), panel])
    );

    const getEffectiveStatus = (panel, visited = new Set()) => {
      if (!panel) return "unknown";

      if (panel.status === "off") return "off";
      if (panel.status === "maintenance") return "maintenance";

      const panelId = Number(panel.id);

      if (visited.has(panelId)) {
        return panel.status || "unknown";
      }

      visited.add(panelId);

      if (!panel.source_panel_id) {
        return panel.status || "live";
      }

      const sourcePanel = panelMap.get(Number(panel.source_panel_id));

      if (!sourcePanel) {
        return panel.status || "live";
      }

      if (
        sourcePanel.status === "off" ||
        sourcePanel.status === "maintenance"
      ) {
        return "affected";
      }

      const sourceEffectiveStatus = getEffectiveStatus(
        sourcePanel,
        new Set(visited)
      );

      if (
        sourceEffectiveStatus === "off" ||
        sourceEffectiveStatus === "maintenance" ||
        sourceEffectiveStatus === "affected"
      ) {
        return "affected";
      }

      return panel.status || "live";
    };

    const networkPanels = panels.map((panel) => ({
      ...panel,
      effective_status: getEffectiveStatus(panel)
    }));

    res.status(200).json({
      success: true,
      count: networkPanels.length,
      panels: networkPanels
    });
  } catch (error) {
    console.error("GET NETWORK STATUS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch network status",
      error: error.message
    });
  }
});

// ==========================================================
// GET ALL DELETED PANELS
// GET /api/panels/history/deleted
// IMPORTANT: MUST STAY ABOVE /:id
// ==========================================================
router.get("/history/deleted", async (req, res) => {
  try {
    const panels = await query(`
      SELECT
        p.*,
        source.panel_code AS source_panel_code,
        source.panel_name AS source_panel_name
      FROM panels p
      LEFT JOIN panels source
        ON p.source_panel_id = source.id
      WHERE p.is_deleted = 1
      ORDER BY p.deleted_at DESC, p.id DESC
    `);

    res.status(200).json({
      success: true,
      count: panels.length,
      panels
    });
  } catch (error) {
    console.error("GET DELETED PANELS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch deleted panel history",
      error: error.message
    });
  }
});

// ==========================================================
// GET ONE DELETED PANEL WITH COMPLETE DETAILS
// GET /api/panels/history/deleted/:id
// IMPORTANT: MUST STAY ABOVE /:id
// ==========================================================
router.get("/history/deleted/:id", async (req, res) => {
  try {
    const panelId = req.params.id;

    if (!isValidId(panelId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid panel ID"
      });
    }

    const panel = await getPanelById(panelId, true);

    if (!panel || Number(panel.is_deleted) !== 1) {
      return res.status(404).json({
        success: false,
        message: "Deleted panel not found"
      });
    }

    const history = await query(
      `
      SELECT *
      FROM panel_status_history
      WHERE panel_id = ?
      ORDER BY started_at DESC
      `,
      [panelId]
    );

    const maintenance = await query(
      `
      SELECT *
      FROM panel_maintenance
      WHERE panel_id = ?
      ORDER BY created_at DESC
      `,
      [panelId]
    );

    res.status(200).json({
      success: true,
      panel,
      history,
      maintenance
    });
  } catch (error) {
    console.error("GET DELETED PANEL DETAILS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch deleted panel details",
      error: error.message
    });
  }
});

// ==========================================================
// RESTORE DELETED PANEL
// PUT /api/panels/history/deleted/:id/restore
// IMPORTANT: MUST STAY ABOVE /:id
// ==========================================================
router.put("/history/deleted/:id/restore", async (req, res) => {
  try {
    const panelId = req.params.id;

    if (!isValidId(panelId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid panel ID"
      });
    }

    const panel = await getPanelById(panelId, true);

    if (!panel || Number(panel.is_deleted) !== 1) {
      return res.status(404).json({
        success: false,
        message: "Deleted panel not found"
      });
    }

    await query(
      `
      UPDATE panels
      SET
        is_deleted = 0,
        deleted_at = NULL,
        deleted_by = NULL,
        deletion_reason = NULL
      WHERE id = ?
      `,
      [panelId]
    );

    const restoredPanel = await getPanelById(panelId);

    emitEvent(req, "panelRestored", {
      panelId: Number(panelId),
      panel: restoredPanel
    });

    emitEvent(req, "panelNetworkUpdated", {
      type: "panel_restored",
      panelId: Number(panelId)
    });

    res.status(200).json({
      success: true,
      message: "Panel restored successfully",
      panel: restoredPanel
    });
  } catch (error) {
    console.error("RESTORE PANEL ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to restore panel",
      error: error.message
    });
  }
});


// ==========================================================
// PERMANENTLY DELETE PANEL
// DELETE /api/panels/history/deleted/:id/permanent
//
// IMPORTANT:
// - Only already soft-deleted panels can be permanently deleted.
// - Connected cable routes are permanently deleted.
// - Status history is permanently deleted.
// - Maintenance history is permanently deleted.
// - Finally, the panel itself is permanently deleted.
// ==========================================================
router.delete("/history/deleted/:id/permanent", async (req, res) => {
  let connection;

  try {
    const panelId = req.params.id;

    if (!isValidId(panelId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid panel ID"
      });
    }

    const panel = await getPanelById(panelId, true);

    if (!panel || Number(panel.is_deleted) !== 1) {
      return res.status(404).json({
        success: false,
        message: "Deleted panel not found"
      });
    }

    // ======================================================
    // GET DATABASE CONNECTION
    // ======================================================
    connection = await new Promise((resolve, reject) => {
      db.getConnection((error, conn) => {
        if (error) reject(error);
        else resolve(conn);
      });
    });

    // ======================================================
    // CONNECTION QUERY HELPER
    // ======================================================
    const connectionQuery = (sql, params = []) => {
      return new Promise((resolve, reject) => {
        connection.query(sql, params, (error, results) => {
          if (error) reject(error);
          else resolve(results);
        });
      });
    };

    // ======================================================
    // START TRANSACTION
    // ======================================================
    await connectionQuery("START TRANSACTION");

    // ======================================================
    // DELETE CONNECTED CABLE ROUTES
    // ======================================================
    await connectionQuery(
      `
      DELETE FROM cable_routes
      WHERE source_panel_id = ?
         OR destination_panel_id = ?
      `,
      [panelId, panelId]
    );

    // ======================================================
    // DELETE STATUS HISTORY
    // ======================================================
    await connectionQuery(
      `
      DELETE FROM panel_status_history
      WHERE panel_id = ?
      `,
      [panelId]
    );

    // ======================================================
    // DELETE MAINTENANCE HISTORY
    // ======================================================
    await connectionQuery(
      `
      DELETE FROM panel_maintenance
      WHERE panel_id = ?
      `,
      [panelId]
    );

    // ======================================================
    // REMOVE SOURCE REFERENCE FROM OTHER PANELS
    //
    // If another panel uses this deleted panel as its source,
    // set its source_panel_id to NULL before permanent deletion.
    // ======================================================
    await connectionQuery(
      `
      UPDATE panels
      SET source_panel_id = NULL
      WHERE source_panel_id = ?
      `,
      [panelId]
    );

    // ======================================================
    // PERMANENTLY DELETE PANEL
    // ======================================================
    await connectionQuery(
      `
      DELETE FROM panels
      WHERE id = ?
        AND is_deleted = 1
      `,
      [panelId]
    );

    // ======================================================
    // COMMIT TRANSACTION
    // ======================================================
    await connectionQuery("COMMIT");

    // ======================================================
    // SOCKET EVENTS
    // ======================================================
    emitEvent(req, "panelPermanentlyDeleted", {
      panelId: Number(panelId),
      panel
    });

    emitEvent(req, "panelNetworkUpdated", {
      type: "panel_permanently_deleted",
      panelId: Number(panelId)
    });

    // ======================================================
    // SUCCESS RESPONSE
    // ======================================================
    res.status(200).json({
      success: true,
      message: "Panel permanently deleted successfully",
      panelId: Number(panelId)
    });
  } catch (error) {
    console.error("PERMANENT DELETE PANEL ERROR:", error);

    // ======================================================
    // ROLLBACK ON ERROR
    // ======================================================
    if (connection) {
      try {
        await new Promise((resolve) => {
          connection.query("ROLLBACK", () => resolve());
        });
      } catch (rollbackError) {
        console.error(
          "PERMANENT DELETE ROLLBACK ERROR:",
          rollbackError.message
        );
      }
    }

    res.status(500).json({
      success: false,
      message: "Failed to permanently delete panel",
      error: error.message
    });
  } finally {
    // ======================================================
    // RELEASE DATABASE CONNECTION
    // ======================================================
    if (connection) {
      connection.release();
    }
  }
});
// ==========================================================
// GET ALL CABLE ROUTES
// GET /api/panels/routes/all
// Routes connected to deleted panels are hidden.
// IMPORTANT: MUST STAY ABOVE /:id
// ==========================================================
router.get("/routes/all", async (req, res) => {
  try {
    const routes = await query(`
      SELECT
        cr.*,
        source.panel_code AS source_panel_code,
        source.panel_name AS source_panel_name,
        source.status AS source_panel_status,
        destination.panel_code AS destination_panel_code,
        destination.panel_name AS destination_panel_name,
        destination.status AS destination_panel_status
      FROM cable_routes cr
      INNER JOIN panels source
        ON cr.source_panel_id = source.id
        AND source.is_deleted = 0
      INNER JOIN panels destination
        ON cr.destination_panel_id = destination.id
        AND destination.is_deleted = 0
      ORDER BY cr.id ASC
    `);

    const formattedRoutes = routes.map((route) => ({
      ...route,
      route_points: parseRoutePoints(route.route_points)
    }));

    res.status(200).json({
      success: true,
      count: formattedRoutes.length,
      routes: formattedRoutes
    });
  } catch (error) {
    console.error("GET ROUTES ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch cable routes",
      error: error.message
    });
  }
});

// ==========================================================
// GET ONE CABLE ROUTE
// GET /api/panels/routes/:routeId
// IMPORTANT: MUST STAY ABOVE /:id
// ==========================================================
router.get("/routes/:routeId", async (req, res) => {
  try {
    const { routeId } = req.params;

    if (!isValidId(routeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid route ID"
      });
    }

    const route = await getRouteById(routeId);

    if (!route) {
      return res.status(404).json({
        success: false,
        message: "Cable route not found"
      });
    }

    res.status(200).json({
      success: true,
      route
    });
  } catch (error) {
    console.error("GET CABLE ROUTE ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch cable route",
      error: error.message
    });
  }
});

// ==========================================================
// ADD CABLE ROUTE
// POST /api/panels/routes
// IMPORTANT: MUST STAY ABOVE /:id
// ==========================================================
router.post("/routes", async (req, res) => {
  try {
    const {
      route_code,
      route_name,
      source_panel_id,
      destination_panel_id,
      route_type,
      cable_size,
      cable_type,
      cable_cores,
      cable_length,
      cable_manufacturer,
      cable_voltage_rating,
      tray_type,
      tray_size,
      tray_material,
      route_points,
      default_color,
      highlight_color,
      line_width,
      route_description,
      notes
    } = req.body;

    if (!route_code) {
      return res.status(400).json({
        success: false,
        message: "Route code is required"
      });
    }

    if (!isValidId(source_panel_id)) {
      return res.status(400).json({
        success: false,
        message: "Valid source_panel_id is required"
      });
    }

    if (!isValidId(destination_panel_id)) {
      return res.status(400).json({
        success: false,
        message: "Valid destination_panel_id is required"
      });
    }

    if (Number(source_panel_id) === Number(destination_panel_id)) {
      return res.status(400).json({
        success: false,
        message: "Source and destination panels cannot be the same"
      });
    }

    const parsedPoints = parseRoutePoints(route_points);

    if (parsedPoints.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Cable route must contain at least 2 route points"
      });
    }

    const duplicate = await query(
      `
      SELECT id
      FROM cable_routes
      WHERE route_code = ?
      LIMIT 1
      `,
      [route_code]
    );

    if (duplicate.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Route code already exists"
      });
    }

    const sourcePanel = await getPanelById(source_panel_id);
    const destinationPanel = await getPanelById(destination_panel_id);

    if (!sourcePanel || !destinationPanel) {
      return res.status(404).json({
        success: false,
        message: "Source or destination panel not found or deleted"
      });
    }

    const result = await query(
      `
      INSERT INTO cable_routes (
        route_code,
        route_name,
        source_panel_id,
        destination_panel_id,
        route_type,
        cable_size,
        cable_type,
        cable_cores,
        cable_length,
        cable_manufacturer,
        cable_voltage_rating,
        tray_type,
        tray_size,
        tray_material,
        route_points,
        default_color,
        highlight_color,
        line_width,
        route_description,
        notes
      )
      VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
      `,
      [
        route_code,
        nullable(route_name),
        Number(source_panel_id),
        Number(destination_panel_id),
        route_type || "cable_tray",
        nullable(cable_size),
        nullable(cable_type),
        nullable(cable_cores),
        nullable(cable_length),
        nullable(cable_manufacturer),
        nullable(cable_voltage_rating),
        nullable(tray_type),
        nullable(tray_size),
        nullable(tray_material),
        JSON.stringify(parsedPoints),
        default_color || "#64748b",
        highlight_color || "#facc15",
        Number(line_width) || 4,
        nullable(route_description),
        nullable(notes)
      ]
    );

    const newRoute = await getRouteById(result.insertId);

    emitEvent(req, "cableRouteCreated", {
      route: newRoute
    });

    emitEvent(req, "panelNetworkUpdated", {
      type: "route_created",
      routeId: result.insertId
    });

    res.status(201).json({
      success: true,
      message: "Cable route created successfully",
      route: newRoute
    });
  } catch (error) {
    console.error("CREATE CABLE ROUTE ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create cable route",
      error: error.message
    });
  }
});

// ==========================================================
// UPDATE CABLE ROUTE
// PUT /api/panels/routes/:routeId
// ==========================================================
router.put("/routes/:routeId", async (req, res) => {
  try {
    const { routeId } = req.params;

    if (!isValidId(routeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid route ID"
      });
    }

    const existingRoute = await getRouteById(routeId);

    if (!existingRoute) {
      return res.status(404).json({
        success: false,
        message: "Cable route not found"
      });
    }

    const allowedFields = [
      "route_code",
      "route_name",
      "source_panel_id",
      "destination_panel_id",
      "route_type",
      "cable_size",
      "cable_type",
      "cable_cores",
      "cable_length",
      "cable_manufacturer",
      "cable_voltage_rating",
      "tray_type",
      "tray_size",
      "tray_material",
      "default_color",
      "highlight_color",
      "line_width",
      "route_description",
      "notes"
    ];

    const fieldsToUpdate = [];
    const values = [];

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        fieldsToUpdate.push(`\`${field}\` = ?`);
        values.push(nullable(req.body[field]));
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "route_points")) {
      const parsedPoints = parseRoutePoints(req.body.route_points);

      if (parsedPoints.length < 2) {
        return res.status(400).json({
          success: false,
          message: "Cable route must contain at least 2 route points"
        });
      }

      fieldsToUpdate.push("`route_points` = ?");
      values.push(JSON.stringify(parsedPoints));
    }

    const finalSourceId = Object.prototype.hasOwnProperty.call(
      req.body,
      "source_panel_id"
    )
      ? Number(req.body.source_panel_id)
      : Number(existingRoute.source_panel_id);

    const finalDestinationId = Object.prototype.hasOwnProperty.call(
      req.body,
      "destination_panel_id"
    )
      ? Number(req.body.destination_panel_id)
      : Number(existingRoute.destination_panel_id);

    if (
      !isValidId(finalSourceId) ||
      !isValidId(finalDestinationId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid source and destination panel IDs are required"
      });
    }

    if (finalSourceId === finalDestinationId) {
      return res.status(400).json({
        success: false,
        message: "Source and destination panels cannot be the same"
      });
    }

    const sourcePanel = await getPanelById(finalSourceId);
    const destinationPanel = await getPanelById(finalDestinationId);

    if (!sourcePanel || !destinationPanel) {
      return res.status(404).json({
        success: false,
        message: "Source or destination panel not found or deleted"
      });
    }

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for route update"
      });
    }

    if (
      Object.prototype.hasOwnProperty.call(req.body, "route_code") &&
      req.body.route_code !== existingRoute.route_code
    ) {
      const duplicate = await query(
        `
        SELECT id
        FROM cable_routes
        WHERE route_code = ?
          AND id != ?
        LIMIT 1
        `,
        [req.body.route_code, routeId]
      );

      if (duplicate.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Route code already exists"
        });
      }
    }

    values.push(routeId);

    await query(
      `
      UPDATE cable_routes
      SET ${fieldsToUpdate.join(", ")}
      WHERE id = ?
      `,
      values
    );

    const updatedRoute = await getRouteById(routeId);

    emitEvent(req, "cableRouteUpdated", {
      route: updatedRoute
    });

    emitEvent(req, "panelNetworkUpdated", {
      type: "route_updated",
      routeId: Number(routeId)
    });

    res.status(200).json({
      success: true,
      message: "Cable route updated successfully",
      route: updatedRoute
    });
  } catch (error) {
    console.error("UPDATE CABLE ROUTE ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update cable route",
      error: error.message
    });
  }
});

// ==========================================================
// REVERSE CABLE ROUTE
// PUT /api/panels/routes/:routeId/reverse
// ==========================================================
router.put("/routes/:routeId/reverse", async (req, res) => {
  try {
    const { routeId } = req.params;

    if (!isValidId(routeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid route ID"
      });
    }

    const route = await getRouteById(routeId);

    if (!route) {
      return res.status(404).json({
        success: false,
        message: "Cable route not found"
      });
    }

    const reversedPoints = [...route.route_points].reverse();

    await query(
      `
      UPDATE cable_routes
      SET
        source_panel_id = ?,
        destination_panel_id = ?,
        route_points = ?
      WHERE id = ?
      `,
      [
        route.destination_panel_id,
        route.source_panel_id,
        JSON.stringify(reversedPoints),
        routeId
      ]
    );

    const updatedRoute = await getRouteById(routeId);

    emitEvent(req, "cableRouteUpdated", {
      route: updatedRoute
    });

    emitEvent(req, "panelNetworkUpdated", {
      type: "route_reversed",
      routeId: Number(routeId)
    });

    res.status(200).json({
      success: true,
      message: "Cable route reversed successfully",
      route: updatedRoute
    });
  } catch (error) {
    console.error("REVERSE CABLE ROUTE ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to reverse cable route",
      error: error.message
    });
  }
});

// ==========================================================
// DELETE CABLE ROUTE
// DELETE /api/panels/routes/:routeId
// ==========================================================
router.delete("/routes/:routeId", async (req, res) => {
  try {
    const { routeId } = req.params;

    if (!isValidId(routeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid route ID"
      });
    }

    const route = await getRouteById(routeId);

    if (!route) {
      return res.status(404).json({
        success: false,
        message: "Cable route not found"
      });
    }

    await query(
      `
      DELETE FROM cable_routes
      WHERE id = ?
      `,
      [routeId]
    );

    emitEvent(req, "cableRouteDeleted", {
      routeId: Number(routeId),
      route
    });

    emitEvent(req, "panelNetworkUpdated", {
      type: "route_deleted",
      routeId: Number(routeId)
    });

    res.status(200).json({
      success: true,
      message: "Cable route deleted successfully",
      routeId: Number(routeId)
    });
  } catch (error) {
    console.error("DELETE CABLE ROUTE ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete cable route",
      error: error.message
    });
  }
});

// ==========================================================
// GET ALL ACTIVE PANELS
// GET /api/panels
// Deleted panels are hidden from list and map.
// ==========================================================
router.get("/", async (req, res) => {
  try {
    const panels = await query(`
      SELECT
        p.*,
        source.panel_code AS source_panel_code,
        source.panel_name AS source_panel_name,
        source.status AS source_panel_status
      FROM panels p
      LEFT JOIN panels source
        ON p.source_panel_id = source.id
        AND source.is_deleted = 0
      WHERE p.is_deleted = 0
      ORDER BY p.id ASC
    `);

    res.status(200).json({
      success: true,
      count: panels.length,
      panels
    });
  } catch (error) {
    console.error("GET PANELS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch panels",
      error: error.message
    });
  }
});

// ==========================================================
// ADD NEW PANEL
// POST /api/panels
// ==========================================================
router.post("/", async (req, res) => {
  try {
    const {
      panel_code,
      panel_name,
      panel_type,
      description,
      area,
      location,
      x_position,
      y_position,
      marker_width,
      marker_height,
      source_panel_id,
      status,
      status_reason,
      voltage,
      rated_current,
      frequency,
      phase,
      incomer_type,
      incomer_rating,
      breaker_type,
      breaker_rating,
      breaking_capacity,
      busbar_rating,
      busbar_material,
      incoming_cable_size,
      incoming_cable_type,
      incoming_cable_cores,
      incoming_cable_length,
      manufacturer,
      model,
      serial_number,
      ip_rating,
      installation_date,
      short_circuit_rating,
      insulation_voltage,
      control_voltage,
      earthing_details,
      last_maintenance_date,
      next_maintenance_date,
      notes
    } = req.body;

    if (!panel_code || !panel_name) {
      return res.status(400).json({
        success: false,
        message: "Panel code and panel name are required"
      });
    }

    const panelStatus = String(status || "live").toLowerCase();

    if (!VALID_STATUSES.includes(panelStatus)) {
      return res.status(400).json({
        success: false,
        message: "Status must be live, off, or maintenance"
      });
    }

    const duplicate = await query(
      `
      SELECT id, is_deleted
      FROM panels
      WHERE panel_code = ?
      LIMIT 1
      `,
      [panel_code]
    );

    if (duplicate.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          Number(duplicate[0].is_deleted) === 1
            ? "Panel code already exists in deleted panel history"
            : "Panel code already exists"
      });
    }

    if (source_panel_id && !isValidId(source_panel_id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid source panel ID"
      });
    }

    if (source_panel_id) {
      const sourcePanel = await getPanelById(source_panel_id);

      if (!sourcePanel) {
        return res.status(404).json({
          success: false,
          message: "Source panel not found or deleted"
        });
      }
    }

    const result = await query(
      `
      INSERT INTO panels (
        panel_code,
        panel_name,
        panel_type,
        description,
        area,
        location,
        x_position,
        y_position,
        marker_width,
        marker_height,
        source_panel_id,
        status,
        status_reason,
        status_changed_at,
        off_started_at,
        voltage,
        rated_current,
        frequency,
        phase,
        incomer_type,
        incomer_rating,
        breaker_type,
        breaker_rating,
        breaking_capacity,
        busbar_rating,
        busbar_material,
        incoming_cable_size,
        incoming_cable_type,
        incoming_cable_cores,
        incoming_cable_length,
        manufacturer,
        model,
        serial_number,
        ip_rating,
        installation_date,
        short_circuit_rating,
        insulation_voltage,
        control_voltage,
        earthing_details,
        last_maintenance_date,
        next_maintenance_date,
        notes,
        is_deleted,
        deleted_at,
        deleted_by,
        deletion_reason
      )
      VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        0, NULL, NULL, NULL
      )
      `,
      [
        panel_code,
        panel_name,
        nullable(panel_type),
        nullable(description),
        nullable(area),
        nullable(location),
        x_position ?? 50,
        y_position ?? 50,
        marker_width ?? 3,
        marker_height ?? 3,
        source_panel_id ? Number(source_panel_id) : null,
        panelStatus,
        nullable(status_reason),
        new Date(),
        panelStatus === "off" || panelStatus === "maintenance"
          ? new Date()
          : null,
        nullable(voltage),
        nullable(rated_current),
        nullable(frequency),
        nullable(phase),
        nullable(incomer_type),
        nullable(incomer_rating),
        nullable(breaker_type),
        nullable(breaker_rating),
        nullable(breaking_capacity),
        nullable(busbar_rating),
        nullable(busbar_material),
        nullable(incoming_cable_size),
        nullable(incoming_cable_type),
        nullable(incoming_cable_cores),
        nullable(incoming_cable_length),
        nullable(manufacturer),
        nullable(model),
        nullable(serial_number),
        nullable(ip_rating),
        nullable(installation_date),
        nullable(short_circuit_rating),
        nullable(insulation_voltage),
        nullable(control_voltage),
        nullable(earthing_details),
        nullable(last_maintenance_date),
        nullable(next_maintenance_date),
        nullable(notes)
      ]
    );

    const newPanelId = result.insertId;

    await query(
      `
      INSERT INTO panel_status_history (
        panel_id,
        old_status,
        new_status,
        reason,
        status_source,
        started_at
      )
      VALUES (?, NULL, ?, ?, 'manual', NOW())
      `,
      [
        newPanelId,
        panelStatus,
        status_reason || "Panel created"
      ]
    );

    const newPanel = await getPanelById(newPanelId);

    emitEvent(req, "panelCreated", {
      panel: newPanel
    });

    emitEvent(req, "panelNetworkUpdated", {
      type: "panel_created",
      panelId: newPanelId
    });

    res.status(201).json({
      success: true,
      message: "Panel created successfully",
      panel: newPanel
    });
  } catch (error) {
    console.error("CREATE PANEL ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create panel",
      error: error.message
    });
  }
});

// ==========================================================
// GET ONE ACTIVE PANEL WITH FULL DETAILS
// GET /api/panels/:id
// ==========================================================
router.get("/:id", async (req, res) => {
  try {
    const panelId = req.params.id;

    if (!isValidId(panelId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid panel ID"
      });
    }

    const panel = await getPanelById(panelId);

    if (!panel) {
      return res.status(404).json({
        success: false,
        message: "Panel not found or deleted"
      });
    }

    const incomingRoutes = await query(
      `
      SELECT cr.*
      FROM cable_routes cr
      INNER JOIN panels source
        ON cr.source_panel_id = source.id
        AND source.is_deleted = 0
      WHERE cr.destination_panel_id = ?
      ORDER BY cr.id ASC
      `,
      [panelId]
    );

    const outgoingRoutes = await query(
      `
      SELECT cr.*
      FROM cable_routes cr
      INNER JOIN panels destination
        ON cr.destination_panel_id = destination.id
        AND destination.is_deleted = 0
      WHERE cr.source_panel_id = ?
      ORDER BY cr.id ASC
      `,
      [panelId]
    );

    const history = await query(
      `
      SELECT *
      FROM panel_status_history
      WHERE panel_id = ?
      ORDER BY started_at DESC
      LIMIT 100
      `,
      [panelId]
    );

    const maintenance = await query(
      `
      SELECT *
      FROM panel_maintenance
      WHERE panel_id = ?
      ORDER BY created_at DESC
      `,
      [panelId]
    );

    res.status(200).json({
      success: true,
      panel,
      incomingRoutes: incomingRoutes.map((route) => ({
        ...route,
        route_points: parseRoutePoints(route.route_points)
      })),
      outgoingRoutes: outgoingRoutes.map((route) => ({
        ...route,
        route_points: parseRoutePoints(route.route_points)
      })),
      history,
      maintenance
    });
  } catch (error) {
    console.error("GET PANEL DETAILS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch panel details",
      error: error.message
    });
  }
});

// ==========================================================
// GET PANEL DOWNTIME STATISTICS
// GET /api/panels/:id/stats
// ==========================================================
router.get("/:id/stats", async (req, res) => {
  try {
    const panelId = req.params.id;

    if (!isValidId(panelId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid panel ID"
      });
    }

    const panel = await getPanelById(panelId);

    if (!panel) {
      return res.status(404).json({
        success: false,
        message: "Panel not found or deleted"
      });
    }

    const buildStatsQuery = (dateCondition) => `
      SELECT
        COUNT(*) AS outage_count,
        COALESCE(
          SUM(
            CASE
              WHEN ended_at IS NOT NULL
                THEN downtime_seconds
              WHEN ended_at IS NULL
                AND new_status IN ('off', 'maintenance')
                THEN TIMESTAMPDIFF(SECOND, started_at, NOW())
              ELSE 0
            END
          ),
          0
        ) AS total_downtime_seconds
      FROM panel_status_history
      WHERE panel_id = ?
        AND new_status IN ('off', 'maintenance')
        AND ${dateCondition}
    `;

    const [todayResults, weekResults, monthResults] = await Promise.all([
      query(
        buildStatsQuery("DATE(started_at) = CURDATE()"),
        [panelId]
      ),
      query(
        buildStatsQuery(
          "YEARWEEK(started_at, 1) = YEARWEEK(CURDATE(), 1)"
        ),
        [panelId]
      ),
      query(
        buildStatsQuery(
          "YEAR(started_at) = YEAR(CURDATE()) AND MONTH(started_at) = MONTH(CURDATE())"
        ),
        [panelId]
      )
    ]);

    res.status(200).json({
      success: true,
      panel: {
        id: panel.id,
        panel_code: panel.panel_code,
        panel_name: panel.panel_name,
        status: panel.status,
        status_changed_at: panel.status_changed_at,
        off_started_at: panel.off_started_at
      },
      today: {
        outage_count: Number(todayResults[0]?.outage_count || 0),
        total_downtime_seconds: Number(
          todayResults[0]?.total_downtime_seconds || 0
        )
      },
      week: {
        outage_count: Number(weekResults[0]?.outage_count || 0),
        total_downtime_seconds: Number(
          weekResults[0]?.total_downtime_seconds || 0
        )
      },
      month: {
        outage_count: Number(monthResults[0]?.outage_count || 0),
        total_downtime_seconds: Number(
          monthResults[0]?.total_downtime_seconds || 0
        )
      }
    });
  } catch (error) {
    console.error("GET PANEL STATS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch panel downtime statistics",
      error: error.message
    });
  }
});

// ==========================================================
// UPDATE PANEL STATUS
// PUT /api/panels/:id/status
//
// LIVE        = GREEN
// OFF         = RED
// MAINTENANCE = YELLOW
//
// Automatically calculates downtime.
// Deleted panels cannot have status changed.
// ==========================================================
router.put("/:id/status", async (req, res) => {
  try {
    const panelId = req.params.id;
    const { status, reason, changed_by } = req.body;

    if (!isValidId(panelId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid panel ID"
      });
    }

    const normalizedStatus = String(status || "").toLowerCase();

    if (!VALID_STATUSES.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Status must be live, off, or maintenance"
      });
    }

    const panel = await getPanelById(panelId);

    if (!panel) {
      return res.status(404).json({
        success: false,
        message: "Panel not found or deleted"
      });
    }

    const oldStatus = panel.status;

    if (oldStatus === normalizedStatus) {
      return res.status(200).json({
        success: true,
        message: `Panel is already ${normalizedStatus}`,
        panel
      });
    }

    const now = new Date();

    const openEvents = await query(
      `
      SELECT *
      FROM panel_status_history
      WHERE panel_id = ?
        AND ended_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
      `,
      [panelId]
    );

    if (openEvents.length > 0) {
      const openEvent = openEvents[0];
      let downtimeSeconds = 0;

      if (
        openEvent.new_status === "off" ||
        openEvent.new_status === "maintenance"
      ) {
        downtimeSeconds = Math.max(
          0,
          Math.floor(
            (
              now.getTime() -
              new Date(openEvent.started_at).getTime()
            ) / 1000
          )
        );
      }

      await query(
        `
        UPDATE panel_status_history
        SET
          ended_at = NOW(),
          downtime_seconds = ?
        WHERE id = ?
        `,
        [downtimeSeconds, openEvent.id]
      );
    }

    await query(
      `
      UPDATE panels
      SET
        status = ?,
        status_reason = ?,
        status_changed_at = NOW(),
        off_started_at = ?
      WHERE id = ?
        AND is_deleted = 0
      `,
      [
        normalizedStatus,
        nullable(reason),
        normalizedStatus === "off" ||
        normalizedStatus === "maintenance"
          ? now
          : null,
        panelId
      ]
    );

    await query(
      `
      INSERT INTO panel_status_history (
        panel_id,
        old_status,
        new_status,
        reason,
        status_source,
        started_at,
        changed_by
      )
      VALUES (?, ?, ?, ?, 'manual', NOW(), ?)
      `,
      [
        panelId,
        oldStatus,
        normalizedStatus,
        nullable(reason),
        nullable(changed_by)
      ]
    );

    const updatedPanel = await getPanelById(panelId);

    emitEvent(req, "panelStatusUpdated", {
      panelId: Number(panelId),
      oldStatus,
      newStatus: normalizedStatus,
      panel: updatedPanel
    });

    emitEvent(req, "panelNetworkUpdated", {
      type: "status_updated",
      panelId: Number(panelId),
      oldStatus,
      newStatus: normalizedStatus
    });

    res.status(200).json({
      success: true,
      message: `Panel status changed from ${oldStatus} to ${normalizedStatus}`,
      panel: updatedPanel
    });
  } catch (error) {
    console.error("UPDATE PANEL STATUS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update panel status",
      error: error.message
    });
  }
});

// ==========================================================
// UPDATE PANEL SPECIFICATIONS
// PUT /api/panels/:id
// Deleted panels cannot be edited.
// ==========================================================
router.put("/:id", async (req, res) => {
  try {
    const panelId = req.params.id;

    if (!isValidId(panelId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid panel ID"
      });
    }

    const existing = await getPanelById(panelId);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Panel not found or deleted"
      });
    }

    const allowedFields = [
      "panel_code",
      "panel_name",
      "panel_type",
      "description",
      "area",
      "location",
      "x_position",
      "y_position",
      "marker_width",
      "marker_height",
      "source_panel_id",
      "status_reason",
      "voltage",
      "rated_current",
      "frequency",
      "phase",
      "incomer_type",
      "incomer_rating",
      "breaker_type",
      "breaker_rating",
      "breaking_capacity",
      "busbar_rating",
      "busbar_material",
      "incoming_cable_size",
      "incoming_cable_type",
      "incoming_cable_cores",
      "incoming_cable_length",
      "manufacturer",
      "model",
      "serial_number",
      "ip_rating",
      "installation_date",
      "short_circuit_rating",
      "insulation_voltage",
      "control_voltage",
      "earthing_details",
      "last_maintenance_date",
      "next_maintenance_date",
      "notes"
    ];

    if (
      Object.prototype.hasOwnProperty.call(req.body, "panel_code") &&
      req.body.panel_code !== existing.panel_code
    ) {
      const duplicate = await query(
        `
        SELECT id, is_deleted
        FROM panels
        WHERE panel_code = ?
          AND id != ?
        LIMIT 1
        `,
        [req.body.panel_code, panelId]
      );

      if (duplicate.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Panel code already exists"
        });
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(req.body, "source_panel_id") &&
      req.body.source_panel_id
    ) {
      if (!isValidId(req.body.source_panel_id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid source panel ID"
        });
      }

      if (Number(req.body.source_panel_id) === Number(panelId)) {
        return res.status(400).json({
          success: false,
          message: "Panel cannot be its own source panel"
        });
      }

      const sourcePanel = await getPanelById(req.body.source_panel_id);

      if (!sourcePanel) {
        return res.status(404).json({
          success: false,
          message: "Source panel not found or deleted"
        });
      }
    }

    const fieldsToUpdate = [];
    const values = [];

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        fieldsToUpdate.push(`\`${field}\` = ?`);

        if (field === "source_panel_id") {
          values.push(
            req.body[field] ? Number(req.body[field]) : null
          );
        } else {
          values.push(nullable(req.body[field]));
        }
      }
    });

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update"
      });
    }

    values.push(panelId);

    await query(
      `
      UPDATE panels
      SET ${fieldsToUpdate.join(", ")}
      WHERE id = ?
        AND is_deleted = 0
      `,
      values
    );

    const updatedPanel = await getPanelById(panelId);

    emitEvent(req, "panelUpdated", {
      panel: updatedPanel
    });

    emitEvent(req, "panelNetworkUpdated", {
      type: "panel_updated",
      panelId: Number(panelId)
    });

    res.status(200).json({
      success: true,
      message: "Panel updated successfully",
      panel: updatedPanel
    });
  } catch (error) {
    console.error("UPDATE PANEL ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update panel",
      error: error.message
    });
  }
});

// ==========================================================
// SOFT DELETE PANEL
// DELETE /api/panels/:id
//
// IMPORTANT:
// - Panel is NOT permanently deleted.
// - Full panel record remains in database.
// - Status history remains.
// - Maintenance history remains.
// - Cable routes remain in database.
// - Panel disappears from normal panel list.
// - Panel disappears from interactive map.
// - Routes connected to deleted panel disappear from active map.
// - Panel becomes available on deleted history page.
// - Panel can be restored later.
// ==========================================================
router.delete("/:id", async (req, res) => {
  let connection;

  try {
    const panelId = req.params.id;

    const {
      deleted_by,
      deletion_reason
    } = req.body || {};

    if (!isValidId(panelId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid panel ID"
      });
    }

    const existing = await getPanelById(panelId);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Panel not found or already deleted"
      });
    }

    connection = await new Promise((resolve, reject) => {
      db.getConnection((error, conn) => {
        if (error) reject(error);
        else resolve(conn);
      });
    });

    const connectionQuery = (sql, params = []) => {
      return new Promise((resolve, reject) => {
        connection.query(sql, params, (error, results) => {
          if (error) reject(error);
          else resolve(results);
        });
      });
    };

    await connectionQuery("START TRANSACTION");

    await connectionQuery(
      `
      UPDATE panels
      SET
        is_deleted = 1,
        deleted_at = NOW(),
        deleted_by = ?,
        deletion_reason = ?
      WHERE id = ?
        AND is_deleted = 0
      `,
      [
        nullable(deleted_by),
        nullable(deletion_reason),
        panelId
      ]
    );

    await connectionQuery("COMMIT");

    const deletedPanel = await getPanelById(panelId, true);

    emitEvent(req, "panelDeleted", {
      panelId: Number(panelId),
      panel: deletedPanel
    });

    emitEvent(req, "panelNetworkUpdated", {
      type: "panel_deleted",
      panelId: Number(panelId)
    });

    res.status(200).json({
      success: true,
      message: "Panel moved to deletion history successfully",
      panelId: Number(panelId),
      panel: deletedPanel
    });
  } catch (error) {
    console.error("SOFT DELETE PANEL ERROR:", error);

    if (connection) {
      try {
        await new Promise((resolve) => {
          connection.query("ROLLBACK", () => resolve());
        });
      } catch (rollbackError) {
        console.error(
          "ROLLBACK ERROR:",
          rollbackError.message
        );
      }
    }

    res.status(500).json({
      success: false,
      message: "Failed to move panel to deletion history",
      error: error.message
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

module.exports = router;