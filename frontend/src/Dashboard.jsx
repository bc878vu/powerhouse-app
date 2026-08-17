import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "./api";

import {
  Users,
  Search,
  RefreshCw,
  Eye,
  Trash2,
  Download,
  X,
  FileText,
  Clock,
  Edit3,
  Save,
  TrendingUp,
  Filter,
  ArrowUpDown,
  Bell,
  UserCheck,
  Wrench,
  Power,
  Settings,
  MapPin,
  CalendarDays,
  Zap,
} from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

import { socket } from "./utils/socket";
import { isPublic } from "./utils/publicMode";

export default function Dashboard() {
  const navigate = useNavigate();

  // =========================================================
  // SOUND
  // =========================================================

  const playSound = (type) => {
    let url = "";

    if (type === "new") {
      url =
        "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";
    }

    if (type === "completed") {
      url =
        "https://assets.mixkit.co/active_storage/sfx/3200/3200-preview.mp3";
    }

    if (type === "rejected") {
      url =
        "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3";
    }

    if (!url) return;

    const audio = new Audio(url);

    audio.play().catch((err) => {
      console.warn("Audio play blocked:", err);
    });
  };

  // =========================================================
  // FULLSCREEN
  // =========================================================

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error("Fullscreen error:", err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error("Exit fullscreen error:", err);
      });
    }
  };

  // =========================================================
  // STATES
  // =========================================================

  const [stats, setStats] = useState({
    staffCount: 0,
    taskCount: 0,

    pendingCount: 0,
    inProgressCount: 0,
    completedCount: 0,
    rejectedCount: 0,

    activities: [],

    onDutyToday: {
      count: 0,
      staff: [],
    },

    panelsUnderWork: {
      count: 0,
      panels: [],
    },

    panelsOff: {
      count: 0,
      panels: [],
    },

    panelsMaintenance: {
      count: 0,
      panels: [],
    },

    operationalSummary: {
      onDutyCount: 0,
      panelsUnderWorkCount: 0,
      panelsOffCount: 0,
      panelsMaintenanceCount: 0,
    },

    serverDate: "",
  });

  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [filterStatus, setFilterStatus] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [staffFilter, setStaffFilter] = useState("All");

  const [sortOrder, setSortOrder] = useState("newest");

  const [notifications, setNotifications] = useState([]);
  const [showPanel, setShowPanel] = useState(false);

  const [toast, setToast] = useState(null);

  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    text: "",
    width: 250,
    height: 120,
  });

  const [reportType, setReportType] = useState(
    isPublic() ? "daily" : "all"
  );

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [dateStep, setDateStep] = useState("from");

  const [previewTask, setPreviewTask] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});

  const [lastCount, setLastCount] = useState(0);

  const [isFullscreen, setIsFullscreen] = useState(false);

  const [allStaff, setAllStaff] = useState([]);

  // =========================================================
  // TOAST
  // =========================================================

  const showToast = (msg) => {
    setToast(msg);

    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  // =========================================================
  // ASSIGNED STAFF HELPERS
  // =========================================================

  const getAssignedUserIds = (task) => {
    if (
      Array.isArray(task?.assigned_user_ids) &&
      task.assigned_user_ids.length
    ) {
      return task.assigned_user_ids.map((id) => String(id));
    }

    return task?.user_id ? [String(task.user_id)] : [];
  };

  const getAssignedStaffNames = (task) => {
    if (
      Array.isArray(task?.assigned_staff_names) &&
      task.assigned_staff_names.length
    ) {
      return task.assigned_staff_names;
    }

    return task?.staff_name ? [task.staff_name] : [];
  };

  const getAssignedUserLabel = (task) => {
    const ids = getAssignedUserIds(task);

    return ids.length ? ids.join(", ") : "N/A";
  };

  const getAssignedStaffLabel = (task) => {
    const names = getAssignedStaffNames(task);

    return names.length ? names.join(", ") : "Unassigned";
  };

  const getPrimaryStaffName = (task) => {
    const names = getAssignedStaffNames(task);

    return names[0] || task?.staff_name || "User";
  };

  // =========================================================
  // API BASE URL HELPER
  // =========================================================

  const getApiBaseUrl = () => {
    return import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, "") || "";
  };

  const getProfileImageUrl = (profilePic, staffName = "Staff") => {
    if (profilePic) {
      if (profilePic.startsWith("data:")) {
        return profilePic;
      }

      if (
        profilePic.startsWith("http://") ||
        profilePic.startsWith("https://")
      ) {
        return profilePic;
      }

      return `${getApiBaseUrl()}/${profilePic.replace(/^\/+/, "")}`;
    }

    return `https://ui-avatars.com/api/?name=${encodeURIComponent(
      staffName
    )}`;
  };

  // =========================================================
  // DASHBOARD RESPONSE MAPPER
  // =========================================================

  const mapDashboardResponse = (data = {}) => {
    const activities = Array.isArray(data.activities)
      ? data.activities
      : [];

    const pendingCount =
      data.pendingCount !== undefined
        ? Number(data.pendingCount || 0)
        : activities.filter((task) => task.status === "Pending").length;

    const inProgressCount =
      data.inProgressCount !== undefined
        ? Number(data.inProgressCount || 0)
        : activities.filter((task) => task.status === "In Progress").length;

    const completedCount =
      data.completedCount !== undefined
        ? Number(data.completedCount || 0)
        : activities.filter((task) => task.status === "Completed").length;

    const rejectedCount =
      data.rejectedCount !== undefined
        ? Number(data.rejectedCount || 0)
        : activities.filter((task) => task.status === "Rejected").length;

    return {
      staffCount: Number(data.staffCount || 0),

      taskCount:
        data.taskCount !== undefined
          ? Number(data.taskCount || 0)
          : activities.length,

      pendingCount,
      inProgressCount,
      completedCount,
      rejectedCount,

      activities,

      onDutyToday: {
        count: Number(
          data.onDutyToday?.count ??
            data.operationalSummary?.onDutyCount ??
            0
        ),

        staff: Array.isArray(data.onDutyToday?.staff)
          ? data.onDutyToday.staff
          : [],
      },

      panelsUnderWork: {
        count: Number(
          data.panelsUnderWork?.count ??
            data.operationalSummary?.panelsUnderWorkCount ??
            0
        ),

        panels: Array.isArray(data.panelsUnderWork?.panels)
          ? data.panelsUnderWork.panels
          : [],
      },

      panelsOff: {
        count: Number(
          data.panelsOff?.count ??
            data.operationalSummary?.panelsOffCount ??
            0
        ),

        panels: Array.isArray(data.panelsOff?.panels)
          ? data.panelsOff.panels
          : [],
      },

      panelsMaintenance: {
        count: Number(
          data.panelsMaintenance?.count ??
            data.operationalSummary?.panelsMaintenanceCount ??
            0
        ),

        panels: Array.isArray(data.panelsMaintenance?.panels)
          ? data.panelsMaintenance.panels
          : [],
      },

      operationalSummary: {
        onDutyCount: Number(
          data.operationalSummary?.onDutyCount ??
            data.onDutyToday?.count ??
            0
        ),

        panelsUnderWorkCount: Number(
          data.operationalSummary?.panelsUnderWorkCount ??
            data.panelsUnderWork?.count ??
            0
        ),

        panelsOffCount: Number(
          data.operationalSummary?.panelsOffCount ??
            data.panelsOff?.count ??
            0
        ),

        panelsMaintenanceCount: Number(
          data.operationalSummary?.panelsMaintenanceCount ??
            data.panelsMaintenance?.count ??
            0
        ),
      },

      serverDate: data.serverDate || "",
    };
  };

  // =========================================================
  // FETCH DASHBOARD STATS
  // =========================================================

  const fetchStats = async () => {
    try {
      const res = await API.get("/activity/stats");

      console.log("✅ DASHBOARD API RESPONSE:", res.data);

      const mappedData = mapDashboardResponse(res.data);

      setStats(mappedData);

      return mappedData;
    } catch (err) {
      console.error(
        "❌ Stats Fetch Error:",
        err?.response?.data || err.message
      );

      return null;
    }
  };

  // =========================================================
  // DELETE TASK
  // =========================================================

  const handleDelete = async (id) => {
    if (!window.confirm("❗ Delete this Task Permanently?")) {
      return;
    }

    try {
      await API.delete(`/task/${id}`);

      setStats((prev) => ({
        ...prev,

        taskCount: Math.max(0, prev.taskCount - 1),

        activities: prev.activities.filter(
          (task) => Number(task.id) !== Number(id)
        ),
      }));

      showToast(`Task #${id} deleted`);

      await fetchStats();
    } catch (err) {
      console.error(
        "❌ DELETE ERROR:",
        err?.response?.data || err.message
      );

      alert("❌ Task delete failed!");
    }
  };

  // =========================================================
  // UPDATE STATUS
  // =========================================================

  const handleStatusUpdate = async (id, status, userId) => {
    try {
      console.log("🔥 STATUS UPDATE:", {
        id,
        status,
        userId,
      });

      await API.put(`/task/update-status/${id}`, {
        status,
      });

      setStats((prev) => ({
        ...prev,

        activities: prev.activities.map((task) =>
          Number(task.id) === Number(id)
            ? {
                ...task,
                status,
              }
            : task
        ),
      }));

      showToast(`Task #${id} → ${status}`);

      await fetchStats();
    } catch (err) {
      console.error(
        "❌ STATUS UPDATE ERROR:",
        err?.response?.data || err.message
      );

      alert("❌ Status update failed!");

      await fetchStats();
    }
  };

  // =========================================================
  // SAVE EDIT
  // =========================================================

  const handleSaveEdit = async () => {
    try {
      const formData = new FormData();

      const assignedUserIds = getAssignedUserIds(editData);

      formData.append("title", editData.title || "");
      formData.append("description", editData.description || "");
      formData.append("category", editData.category || "");
      formData.append("status", editData.status || "Pending");
      formData.append("priority", editData.priority || "Low");

      if (editData.panel_id !== undefined) {
        formData.append(
          "panel_id",
          editData.panel_id === null ? "" : editData.panel_id
        );
      }

      formData.append("user_id", assignedUserIds[0] || "");

      assignedUserIds.forEach((userId) => {
        formData.append("user_ids[]", userId);
      });

      formData.append("removedFiles", JSON.stringify([]));

      await API.put(`/task/${editData.id}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      alert("✅ Task Updated Successfully!");

      setEditMode(false);

      setStats((prev) => ({
        ...prev,

        activities: prev.activities.map((task) =>
          Number(task.id) === Number(editData.id)
            ? {
                ...task,
                ...editData,
              }
            : task
        ),
      }));

      setPreviewTask(editData);

      await fetchStats();
    } catch (err) {
      console.error(
        "❌ UPDATE ERROR:",
        err?.response?.data || err.message
      );

      alert("❌ Update Failed!");
    }
  };

  // =========================================================
  // INITIAL DATA + POLLING + LIVE SOCKET
  // =========================================================

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoading(true);

      await fetchStats();

      if (mounted) {
        setLoading(false);
      }
    };

    init();

    const interval = setInterval(() => {
      fetchStats();
    }, 5000);

    socket.off("updateData");

    const handleLiveUpdate = async () => {
      console.log("⚡ LIVE UPDATE");

      try {
        const res = await API.get("/activity/stats");

        const newActivities = Array.isArray(res.data?.activities)
          ? res.data.activities
          : [];

        const latest = newActivities[0];

        if (latest) {
          if (latest.status === "Completed") {
            playSound("completed");
          } else if (latest.status === "Rejected") {
            playSound("rejected");
          } else {
            playSound("new");
          }

          setNotifications((prev) => [
            {
              id: Date.now(),

              text: `${getPrimaryStaffName(latest)} → ${
                latest.status || "Updated"
              }`,

              time: new Date().toLocaleTimeString(),
            },

            ...prev.slice(0, 9),
          ]);

          showToast(
            `Task #${latest.id || ""} ${
              latest.status || "Updated"
            }`
          );
        }

        setLastCount(newActivities.length);

        setStats(mapDashboardResponse(res.data));
      } catch (err) {
        console.error(
          "❌ LIVE UPDATE FETCH ERROR:",
          err?.response?.data || err.message
        );
      }
    };

    socket.on("updateData", handleLiveUpdate);

    return () => {
      mounted = false;

      socket.off("updateData", handleLiveUpdate);

      clearInterval(interval);
    };
  }, []);

  // =========================================================
  // FULLSCREEN EVENT
  // =========================================================

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handler);

    return () => {
      document.removeEventListener("fullscreenchange", handler);
    };
  }, []);

  // =========================================================
  // SOCKET CONNECTION
  // =========================================================

  useEffect(() => {
    const handleConnect = () => {
      console.log("✅ SOCKET CONNECTED:", socket.id);
    };

    const handleConnectError = (err) => {
      console.log("❌ SOCKET ERROR:", err.message);
    };

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);

    socket.emit("joinAdmin");

    return () => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
    };
  }, []);

  // =========================================================
  // SEARCH DEBOUNCE
  // =========================================================

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // =========================================================
  // FETCH ALL STAFF
  // =========================================================

  useEffect(() => {
    API.get("/user/all")
      .then((res) => {
        setAllStaff(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        console.error(
          "❌ STAFF FETCH ERROR:",
          err?.response?.data || err.message
        );
      });
  }, []);

  // =========================================================
  // STAFF LIST
  // =========================================================

  const staffList = useMemo(() => {
    return [
      ...new Set(
        allStaff
          .map((staff) => staff?.name)
          .filter(Boolean)
      ),
    ];
  }, [allStaff]);

  // =========================================================
  // FILTER DATA
  // =========================================================

  const filteredData = useMemo(() => {
    const searchValue = debouncedSearch.trim().toLowerCase();

    let result = (stats.activities || []).filter((act) => {
      const assignedNames = getAssignedStaffNames(act);
      const assignedIds = getAssignedUserIds(act);

      const matchesStatus =
        filterStatus === "All" ||
        act.status === filterStatus;

      const matchesCategory =
        categoryFilter === "All" ||
        act.category === categoryFilter;

      const matchesPriority =
        priorityFilter === "All" ||
        (act.priority || "Low") === priorityFilter;

      const matchesStaff =
        staffFilter === "All" ||
        assignedNames.includes(staffFilter) ||
        act.staff_name === staffFilter;

      const matchesSearch =
        !searchValue ||
        (act.title || "")
          .toLowerCase()
          .includes(searchValue) ||
        (act.description || "")
          .toLowerCase()
          .includes(searchValue) ||
        (act.staff_name || "")
          .toLowerCase()
          .includes(searchValue) ||
        assignedNames.some((name) =>
          String(name)
            .toLowerCase()
            .includes(searchValue)
        ) ||
        String(act.id || "").includes(searchValue) ||
        String(act.user_id || "").includes(searchValue) ||
        assignedIds.some((id) =>
          String(id).includes(searchValue)
        ) ||
        (act.panel_name || "")
          .toLowerCase()
          .includes(searchValue) ||
        (act.panel_code || "")
          .toLowerCase()
          .includes(searchValue);

      return (
        matchesStatus &&
        matchesCategory &&
        matchesPriority &&
        matchesStaff &&
        matchesSearch
      );
    });

    result = result.filter((item) => {
      if (!item.created_at) {
        return reportType === "all";
      }

      const itemDate = new Date(item.created_at);

      if (Number.isNaN(itemDate.getTime())) {
        return reportType === "all";
      }

      const now = new Date();

      if (
        reportType === "custom" &&
        startDate &&
        endDate
      ) {
        const start = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T23:59:59.999`);

        return itemDate >= start && itemDate <= end;
      }

      if (reportType === "all") {
        return true;
      }

      if (reportType === "daily") {
        return (
          itemDate.getFullYear() === now.getFullYear() &&
          itemDate.getMonth() === now.getMonth() &&
          itemDate.getDate() === now.getDate()
        );
      }

      if (reportType === "weekly") {
        const weekAgo = new Date(now);

        weekAgo.setDate(now.getDate() - 7);

        return itemDate >= weekAgo && itemDate <= now;
      }

      if (reportType === "monthly") {
        return (
          itemDate.getMonth() === now.getMonth() &&
          itemDate.getFullYear() === now.getFullYear()
        );
      }

      if (reportType === "yearly") {
        return itemDate.getFullYear() === now.getFullYear();
      }

      return true;
    });

    const priorityOrder = {
      High: 3,
      Medium: 2,
      Low: 1,
    };

    return [...result].sort((a, b) => {
      if (isPublic()) {
        if (
          a.status === "Pending" &&
          b.status !== "Pending"
        ) {
          return -1;
        }

        if (
          a.status !== "Pending" &&
          b.status === "Pending"
        ) {
          return 1;
        }
      }

      if (sortOrder === "priority") {
        return (
          priorityOrder[b.priority || "Low"] -
          priorityOrder[a.priority || "Low"]
        );
      }

      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();

      return sortOrder === "newest"
        ? dateB - dateA
        : dateA - dateB;
    });
  }, [
    stats.activities,
    filterStatus,
    categoryFilter,
    priorityFilter,
    staffFilter,
    debouncedSearch,
    sortOrder,
    reportType,
    startDate,
    endDate,
  ]);

  // =========================================================
  // CHART
  // =========================================================

  const chartData = [
    {
      name: "Total",
      value: filteredData.length,
      color: "#eab308",
    },

    {
      name: "Running",

      value: filteredData.filter(
        (task) => task.status === "In Progress"
      ).length,

      color: "#f97316",
    },

    {
      name: "Closed",

      value: filteredData.filter(
        (task) => task.status === "Completed"
      ).length,

      color: "#22c55e",
    },
  ];

  // =========================================================
  // CSV HELPERS
  // =========================================================

  const escapeCsv = (value) => {
    const text =
      value === null || value === undefined
        ? ""
        : String(value);

    return `"${text.replace(/"/g, '""')}"`;
  };

  // =========================================================
  // EXPORT REPORT
  // =========================================================

  const exportAdvancedReport = () => {
    const header = [
      "Task ID",
      "User ID",
      "Title",
      "Category",
      "Priority",
      "Status",
      "Staff",
      "Panel Code",
      "Panel Name",
      "Date",
    ];

    const rows = filteredData.map((task) => [
      task.id,
      getAssignedUserLabel(task),
      task.title || "",
      task.category || "",
      task.priority || "Low",
      task.status || "",
      getAssignedStaffLabel(task),
      task.panel_code || "",
      task.panel_name || "",
      task.created_at
        ? new Date(task.created_at).toLocaleString()
        : "",
    ]);

    const csv = [
      header.map(escapeCsv).join(","),

      ...rows.map((row) =>
        row.map(escapeCsv).join(",")
      ),
    ].join("\n");

    const blob = new Blob(
      ["\uFEFF" + csv],
      {
        type: "text/csv;charset=utf-8;",
      }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = `PowerHouse_Report_${reportType}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  // =========================================================
  // LOADING
  // =========================================================

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0f1e] text-yellow-500 font-bold">
        Loading Live Data...

        {toast && (
          <div className="fixed bottom-5 right-5 bg-yellow-500 text-black px-4 py-2 rounded-xl text-xs font-bold shadow-lg z-50">
            {toast}
          </div>
        )}
      </div>
    );
  }

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden pt-[70px] bg-[#0a0f1e]">

      {/* ================================================= */}
      {/* TOP SECTION */}
      {/* ================================================= */}

      <div className="p-1 lg:p-1 space-y-3 sticky top-0 z-40 bg-[#0a0f1e]">

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-3">

          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-white italic uppercase tracking-tighter">

              {isPublic() ? (
                <>
                  LIVE ⚡{" "}
                  <span className="text-yellow-500">
                    MONITOR
                  </span>
                </>
              ) : (
                <>
                  Admin{" "}
                  <span className="text-yellow-500">
                    Ultra Portal
                  </span>
                </>
              )}

            </h1>

            <p className="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-[0.4em] mt-1 italic">
              Operational Analytics & Command
            </p>
          </div>

          <div className="flex flex-wrap md:flex-nowrap items-center gap-2">

            <button
              onClick={() => setShowPanel((prev) => !prev)}
              className="relative p-3 bg-white/5 border border-white/10 rounded-2xl text-yellow-500"
            >
              <Bell size={18} />

              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 flex items-center justify-center bg-red-500 text-white text-[9px] font-black rounded-full">
                  {notifications.length}
                </span>
              )}
            </button>

            <button
              onClick={toggleFullscreen}
              className="px-4 py-2 bg-yellow-500 text-black rounded-xl text-xs font-bold"
            >
              {isFullscreen
                ? "Exit Fullscreen"
                : "Fullscreen"}
            </button>

            <div className="relative group">

              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                size={16}
              />

              <input
                type="text"
                placeholder="Search ID, Name, Task, Panel..."
                className="pl-12 pr-6 py-3 bg-slate-900 border border-white/10 rounded-2xl text-xs text-white outline-none focus:border-yellow-500/50 w-full md:w-64"
                value={searchTerm}
                onChange={(e) =>
                  setSearchTerm(e.target.value)
                }
              />

            </div>

            <button
              onClick={fetchStats}
              className="p-3 bg-white/5 border border-white/10 rounded-2xl text-yellow-500 hover:scale-105 transition-all"
              title="Refresh dashboard"
            >
              <RefreshCw
                size={18}
                className="hover:rotate-180 transition-transform duration-500"
              />
            </button>

          </div>

          {showPanel && (
            <div className="absolute right-0 top-[70px] w-80 max-w-[calc(100vw-20px)] bg-slate-900 border border-white/10 rounded-2xl p-4 z-50 shadow-2xl">

              <div className="flex items-center justify-between mb-3">

                <h3 className="text-white text-sm font-bold">
                  Notifications
                </h3>

                {notifications.length > 0 && (
                  <button
                    onClick={() => setNotifications([])}
                    className="text-[9px] text-yellow-500 font-black uppercase"
                  >
                    Clear
                  </button>
                )}

              </div>

              {notifications.length === 0 ? (
                <p className="text-slate-500 text-xs">
                  No activity
                </p>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="border-b border-white/5 py-2"
                  >
                    <p className="text-xs text-white">
                      {notification.text}
                    </p>

                    <p className="text-[10px] text-slate-500">
                      {notification.time}
                    </p>
                  </div>
                ))
              )}

            </div>
          )}

        </div>

        {/* ================================================= */}
        {/* ANALYTICS GRAPH */}
        {/* ================================================= */}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-3 bg-[#0a0f1e] py-2">

          <div className="lg:col-span-2 bg-slate-900/40 border border-white/5 p-4 md:p-5 rounded-2xl md:rounded-[2.5rem] shadow-xl min-h-[220px]">

            <h3 className="text-white font-black text-sm uppercase tracking-widest mb-8 flex items-center gap-2">

              <TrendingUp
                size={18}
                className="text-yellow-500"
              />

              Operational Efficiency

            </h3>

            <ResponsiveContainer
              width="100%"
              height={160}
            >
              <BarChart data={chartData}>

                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#ffffff05"
                  vertical={false}
                />

                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#64748b",
                    fontSize: 10,
                    fontWeight: "bold",
                  }}
                />

                <Tooltip
                  cursor={{
                    fill: "#ffffff05",
                  }}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "none",
                    borderRadius: "15px",
                  }}
                />

                <Bar
                  dataKey="value"
                  radius={[10, 10, 10, 10]}
                  barSize={50}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                    />
                  ))}
                </Bar>

              </BarChart>
            </ResponsiveContainer>

          </div>

          {/* ================================================= */}
          {/* TASK STAT CARDS */}
          {/* ================================================= */}

          <div className="grid grid-cols-2 gap-3">

            {[
              {
                label: "Staff",
                val: stats.staffCount,
                color: "text-blue-400",
              },

              {
                label: "Total",
                val: filteredData.length,
                color: "text-yellow-500",
              },

              {
                label: "Pending",
                val: filteredData.filter(
                  (task) => task.status === "Pending"
                ).length,
                color: "text-yellow-400",
              },

              {
                label: "Active",
                val: filteredData.filter(
                  (task) =>
                    task.status === "In Progress"
                ).length,
                color: "text-orange-400",
              },

              {
                label: "Closed",
                val: filteredData.filter(
                  (task) => task.status === "Completed"
                ).length,
                color: "text-green-400",
              },

              {
                label: "Rejected",
                val: filteredData.filter(
                  (task) => task.status === "Rejected"
                ).length,
                color: "text-red-400",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-slate-900/40 border border-white/5 p-4 rounded-[1.5rem] text-center shadow-lg"
              >
                <h2
                  className={`text-3xl font-black mb-1 ${item.color}`}
                >
                  {item.val}
                </h2>

                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  {item.label}
                </p>
              </div>
            ))}

          </div>

        </div>

        {/* ================================================= */}
        {/* LIVE OPERATIONAL STATUS */}
        {/* ================================================= */}

        <div className="mb-4">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 px-2">

            <div>

              <h2 className="text-xl md:text-2xl font-black text-white italic uppercase flex items-center gap-3">

                <Zap
                  size={24}
                  className="text-yellow-500"
                />

                Live Operational Status

              </h2>

              <p className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase tracking-[0.25em] mt-1">
                Real-time staff duty and electrical panel monitoring
              </p>

            </div>

            {stats.serverDate && (
              <div className="flex items-center gap-2 bg-slate-900/60 border border-white/5 px-4 py-2 rounded-xl">

                <CalendarDays
                  size={15}
                  className="text-yellow-500"
                />

                <span className="text-white text-xs font-bold">
                  {stats.serverDate}
                </span>

              </div>
            )}

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">

            {/* ON DUTY TODAY */}

            <div className="bg-slate-900/50 border border-blue-500/20 rounded-[2rem] p-5 shadow-xl">

              <div className="flex items-center justify-between mb-5">

                <div className="flex items-center gap-3">

                  <div className="w-11 h-11 flex items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
                    <UserCheck size={22} />
                  </div>

                  <div>
                    <p className="text-white text-sm font-black uppercase">
                      On Duty Today
                    </p>

                    <p className="text-[9px] text-slate-500 uppercase tracking-wider">
                      Current Staff
                    </p>
                  </div>

                </div>

                <span className="text-3xl font-black text-blue-400">
                  {stats.onDutyToday.count}
                </span>

              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">

                {stats.onDutyToday.staff.length === 0 ? (
                  <div className="bg-slate-950/60 border border-white/5 rounded-2xl p-4 text-center">

                    <Users
                      size={24}
                      className="mx-auto text-slate-600 mb-2"
                    />

                    <p className="text-slate-500 text-[10px] font-bold uppercase">
                      No staff on duty today
                    </p>

                  </div>
                ) : (
                  stats.onDutyToday.staff.map(
                    (staff, index) => (
                      <div
                        key={
                          staff.duty_id ||
                          `${staff.user_id}-${index}`
                        }
                        className="bg-slate-950/60 border border-white/5 rounded-2xl p-3"
                      >

                        <div className="flex items-center gap-3">

                          <img
                            src={getProfileImageUrl(
                              staff.profile_pic,
                              staff.staff_name
                            )}
                            alt={
                              staff.staff_name || "Staff"
                            }
                            className="w-10 h-10 rounded-full object-cover border border-blue-500/40"
                          />

                          <div className="min-w-0 flex-1">

                            <p className="text-white text-xs font-black truncate">
                              {staff.staff_name ||
                                "Unknown Staff"}
                            </p>

                            <p className="text-blue-400 text-[9px] font-bold uppercase">
                              {staff.shift_name ||
                                "Shift not specified"}
                            </p>

                            <p className="text-slate-500 text-[9px] mt-1">
                              ID:{" "}
                              {staff.employee_id ||
                                staff.user_id ||
                                "N/A"}
                            </p>

                          </div>

                        </div>

                        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">

                          <span className="text-[9px] text-slate-400">
                            {staff.start_time || "--:--"}
                          </span>

                          <span className="text-[9px] text-blue-400 font-black">
                            ON DUTY
                          </span>

                          <span className="text-[9px] text-slate-400">
                            {staff.end_time || "--:--"}
                          </span>

                        </div>

                      </div>
                    )
                  )
                )}

              </div>

            </div>

            {/* PANELS UNDER WORK */}

            <div className="bg-slate-900/50 border border-orange-500/20 rounded-[2rem] p-5 shadow-xl">

              <div className="flex items-center justify-between mb-5">

                <div className="flex items-center gap-3">

                  <div className="w-11 h-11 flex items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
                    <Wrench size={22} />
                  </div>

                  <div>
                    <p className="text-white text-sm font-black uppercase">
                      Under Work
                    </p>

                    <p className="text-[9px] text-slate-500 uppercase tracking-wider">
                      Active Panel Tasks
                    </p>
                  </div>

                </div>

                <span className="text-3xl font-black text-orange-400">
                  {stats.panelsUnderWork.count}
                </span>

              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">

                {stats.panelsUnderWork.panels.length ===
                0 ? (
                  <div className="bg-slate-950/60 border border-white/5 rounded-2xl p-4 text-center">

                    <Wrench
                      size={24}
                      className="mx-auto text-slate-600 mb-2"
                    />

                    <p className="text-slate-500 text-[10px] font-bold uppercase">
                      No panel under work
                    </p>

                  </div>
                ) : (
                  stats.panelsUnderWork.panels.map(
                    (panel, index) => (
                      <div
                        key={`${panel.panel_id}-${panel.task_id}-${index}`}
                        className="bg-slate-950/60 border border-orange-500/10 rounded-2xl p-3"
                      >

                        <div className="flex items-start justify-between gap-2">

                          <div className="min-w-0">

                            <p className="text-white text-xs font-black truncate">
                              {panel.panel_name ||
                                "Unnamed Panel"}
                            </p>

                            <p className="text-orange-400 text-[9px] font-bold uppercase mt-1">
                              {panel.panel_code ||
                                `Panel #${
                                  panel.panel_id || "N/A"
                                }`}
                            </p>

                          </div>

                          <span
                            className={`shrink-0 px-2 py-1 rounded-full text-[8px] font-black uppercase ${
                              panel.task_priority === "High"
                                ? "bg-red-500/15 text-red-400"
                                : panel.task_priority ===
                                  "Medium"
                                ? "bg-yellow-500/15 text-yellow-400"
                                : "bg-green-500/15 text-green-400"
                            }`}
                          >
                            {panel.task_priority || "Low"}
                          </span>

                        </div>

                        <div className="mt-3">

                          <p className="text-slate-300 text-[10px] font-bold">
                            #{panel.task_id || "N/A"} —{" "}
                            {panel.task_title ||
                              "No task title"}
                          </p>

                        </div>

                        <div className="mt-3 pt-3 border-t border-white/5">

                          <p className="text-[9px] text-slate-500 uppercase mb-1">
                            Assigned Staff
                          </p>

                          <p className="text-[10px] text-white font-bold">
                            {Array.isArray(
                              panel.assigned_staff_names
                            ) &&
                            panel.assigned_staff_names.length
                              ? panel.assigned_staff_names.join(
                                  ", "
                                )
                              : panel.staff_name ||
                                "Unassigned"}
                          </p>

                        </div>

                        {(panel.area ||
                          panel.location) && (
                          <div className="flex items-center gap-1 mt-2 text-[9px] text-slate-500">

                            <MapPin size={11} />

                            <span>
                              {[
                                panel.area,
                                panel.location,
                              ]
                                .filter(Boolean)
                                .join(" • ")}
                            </span>

                          </div>
                        )}

                      </div>
                    )
                  )
                )}

              </div>

            </div>

            {/* PANELS OFF */}

            <div className="bg-slate-900/50 border border-red-500/20 rounded-[2rem] p-5 shadow-xl">

              <div className="flex items-center justify-between mb-5">

                <div className="flex items-center gap-3">

                  <div className="w-11 h-11 flex items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
                    <Power size={22} />
                  </div>

                  <div>
                    <p className="text-white text-sm font-black uppercase">
                      Panels Off
                    </p>

                    <p className="text-[9px] text-slate-500 uppercase tracking-wider">
                      Currently Offline
                    </p>
                  </div>

                </div>

                <span className="text-3xl font-black text-red-400">
                  {stats.panelsOff.count}
                </span>

              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">

                {stats.panelsOff.panels.length === 0 ? (
                  <div className="bg-slate-950/60 border border-white/5 rounded-2xl p-4 text-center">

                    <Power
                      size={24}
                      className="mx-auto text-slate-600 mb-2"
                    />

                    <p className="text-slate-500 text-[10px] font-bold uppercase">
                      No panel is currently off
                    </p>

                  </div>
                ) : (
                  stats.panelsOff.panels.map(
                    (panel, index) => (
                      <div
                        key={
                          panel.panel_id ||
                          `off-${index}`
                        }
                        className="bg-slate-950/60 border border-red-500/10 rounded-2xl p-3"
                      >

                        <div className="flex items-start justify-between gap-2">

                          <div>

                            <p className="text-white text-xs font-black">
                              {panel.panel_name ||
                                "Unnamed Panel"}
                            </p>

                            <p className="text-red-400 text-[9px] font-bold uppercase mt-1">
                              {panel.panel_code ||
                                `Panel #${
                                  panel.panel_id || "N/A"
                                }`}
                            </p>

                          </div>

                          <span className="px-2 py-1 bg-red-500/15 text-red-400 rounded-full text-[8px] font-black uppercase">
                            Off
                          </span>

                        </div>

                        {panel.status_reason && (
                          <div className="mt-3 bg-red-500/5 border border-red-500/10 rounded-xl p-2">

                            <p className="text-[9px] text-red-300">
                              {panel.status_reason}
                            </p>

                          </div>
                        )}

                        {(panel.area ||
                          panel.location) && (
                          <div className="flex items-center gap-1 mt-3 text-[9px] text-slate-500">

                            <MapPin size={11} />

                            <span>
                              {[
                                panel.area,
                                panel.location,
                              ]
                                .filter(Boolean)
                                .join(" • ")}
                            </span>

                          </div>
                        )}

                        {panel.off_started_at && (
                          <p className="text-[8px] text-slate-600 mt-2">
                            Off since:{" "}
                            {new Date(
                              panel.off_started_at
                            ).toLocaleString()}
                          </p>
                        )}

                      </div>
                    )
                  )
                )}

              </div>

            </div>

            {/* PANELS MAINTENANCE */}

            <div className="bg-slate-900/50 border border-purple-500/20 rounded-[2rem] p-5 shadow-xl">

              <div className="flex items-center justify-between mb-5">

                <div className="flex items-center gap-3">

                  <div className="w-11 h-11 flex items-center justify-center rounded-2xl bg-purple-500/10 text-purple-400">
                    <Settings size={22} />
                  </div>

                  <div>
                    <p className="text-white text-sm font-black uppercase">
                      Maintenance
                    </p>

                    <p className="text-[9px] text-slate-500 uppercase tracking-wider">
                      Panels in Service
                    </p>
                  </div>

                </div>

                <span className="text-3xl font-black text-purple-400">
                  {stats.panelsMaintenance.count}
                </span>

              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">

                {stats.panelsMaintenance.panels
                  .length === 0 ? (
                  <div className="bg-slate-950/60 border border-white/5 rounded-2xl p-4 text-center">

                    <Settings
                      size={24}
                      className="mx-auto text-slate-600 mb-2"
                    />

                    <p className="text-slate-500 text-[10px] font-bold uppercase">
                      No panel under maintenance
                    </p>

                  </div>
                ) : (
                  stats.panelsMaintenance.panels.map(
                    (panel, index) => (
                      <div
                        key={
                          panel.panel_id ||
                          `maintenance-${index}`
                        }
                        className="bg-slate-950/60 border border-purple-500/10 rounded-2xl p-3"
                      >

                        <div className="flex items-start justify-between gap-2">

                          <div>

                            <p className="text-white text-xs font-black">
                              {panel.panel_name ||
                                "Unnamed Panel"}
                            </p>

                            <p className="text-purple-400 text-[9px] font-bold uppercase mt-1">
                              {panel.panel_code ||
                                `Panel #${
                                  panel.panel_id || "N/A"
                                }`}
                            </p>

                          </div>

                          <span className="px-2 py-1 bg-purple-500/15 text-purple-400 rounded-full text-[8px] font-black uppercase">
                            Maintenance
                          </span>

                        </div>

                        {panel.status_reason && (
                          <div className="mt-3 bg-purple-500/5 border border-purple-500/10 rounded-xl p-2">

                            <p className="text-[9px] text-purple-300">
                              {panel.status_reason}
                            </p>

                          </div>
                        )}

                        <div className="mt-3 space-y-1">

                          {panel.last_maintenance_date && (
                            <p className="text-[9px] text-slate-500">
                              Last:{" "}
                              <span className="text-white">
                                {new Date(
                                  panel.last_maintenance_date
                                ).toLocaleDateString()}
                              </span>
                            </p>
                          )}

                          {panel.next_maintenance_date && (
                            <p className="text-[9px] text-slate-500">
                              Next:{" "}
                              <span className="text-purple-400 font-bold">
                                {new Date(
                                  panel.next_maintenance_date
                                ).toLocaleDateString()}
                              </span>
                            </p>
                          )}

                        </div>

                        {(panel.area ||
                          panel.location) && (
                          <div className="flex items-center gap-1 mt-3 text-[9px] text-slate-500">

                            <MapPin size={11} />

                            <span>
                              {[
                                panel.area,
                                panel.location,
                              ]
                                .filter(Boolean)
                                .join(" • ")}
                            </span>

                          </div>
                        )}

                      </div>
                    )
                  )
                )}

              </div>

            </div>

          </div>

        </div>

        {/* ================================================= */}
        {/* FILTERING & REPORTS */}
        {/* ================================================= */}

        <div className="bg-slate-900/40 border border-white/5 rounded-[2.5rem] p-5 lg:p-6 shadow-xl mb-3 backdrop-blur-xl">

          <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between mb-6">

            <h2 className="text-2xl font-black text-white italic uppercase flex items-center gap-3">

              <Filter
                className="text-yellow-500"
                size={24}
              />

              Filtering & Reports

            </h2>

            <button
              onClick={exportAdvancedReport}
              className="bg-yellow-500 text-slate-950 px-8 py-3 rounded-2xl font-black text-[10px] md:text-xs uppercase flex items-center justify-center gap-2 shadow-xl shadow-yellow-500/10"
            >
              <Download size={16} />

              Download Custom Report
            </button>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">

            {/* STATUS */}

            <div className="space-y-2">

              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2">
                Status
              </label>

              <select
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-4 text-white text-xs outline-none"
                value={filterStatus}
                onChange={(e) =>
                  setFilterStatus(e.target.value)
                }
              >
                <option value="All">
                  All Statuses
                </option>

                <option value="Pending">
                  Pending
                </option>

                <option value="In Progress">
                  In Progress
                </option>

                <option value="Completed">
                  Completed
                </option>

                <option value="Rejected">
                  Rejected
                </option>
              </select>

            </div>

            {/* CATEGORY */}

            <div className="space-y-2">

              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2">
                Category
              </label>

              <select
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-4 text-white text-xs outline-none"
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value)
                }
              >
                <option value="All">
                  All Categories
                </option>

                <option value="Electrical">
                  Electrical
                </option>

                <option value="Mechanical">
                  Mechanical
                </option>

                <option value="General">
                  General
                </option>
              </select>

            </div>

            {/* PRIORITY */}

            <div className="space-y-2">

              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2">
                Priority
              </label>

              <select
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-4 text-white text-xs outline-none"
                value={priorityFilter}
                onChange={(e) =>
                  setPriorityFilter(e.target.value)
                }
              >
                <option value="All">
                  All Priority
                </option>

                <option value="Low">
                  Low
                </option>

                <option value="Medium">
                  Medium
                </option>

                <option value="High">
                  High
                </option>
              </select>

            </div>

            {/* STAFF */}

            <div className="space-y-2">

              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2">
                By Staff Name
              </label>

              <select
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-4 text-white text-xs outline-none"
                value={staffFilter}
                onChange={(e) =>
                  setStaffFilter(e.target.value)
                }
              >
                <option value="All">
                  All Staff Members
                </option>

                {staffList.map((name) => (
                  <option
                    key={name}
                    value={name}
                  >
                    {name}
                  </option>
                ))}
              </select>

            </div>

            {/* TIMELINE */}

            <div className="space-y-2">

              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2">
                Timeline
              </label>

              <button
                onClick={() =>
                  setSortOrder((prev) =>
                    prev === "newest"
                      ? "oldest"
                      : "newest"
                  )
                }
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-4 text-white text-xs flex justify-between items-center"
              >
                <span>
                  {sortOrder === "newest"
                    ? "Sort: Newest First"
                    : "Sort: Oldest First"}
                </span>

                <ArrowUpDown
                  size={14}
                  className="text-yellow-500"
                />
              </button>

            </div>

            {/* REPORT TYPE */}

            <div className="space-y-2">

              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2">
                Report Type
              </label>

              {reportType === "custom" &&
                dateStep !== "done" && (
                  <input
                    type="date"
                    autoFocus
                    value={
                      dateStep === "from"
                        ? startDate
                        : endDate
                    }
                    min={
                      dateStep === "to"
                        ? startDate
                        : undefined
                    }
                    onChange={(e) => {
                      if (dateStep === "from") {
                        setStartDate(e.target.value);
                        setDateStep("to");
                      } else {
                        setEndDate(e.target.value);
                        setDateStep("done");
                      }
                    }}
                    className="w-full mt-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-white text-xs outline-none"
                  />
                )}

              <select
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-4 text-white text-xs outline-none"
                value={reportType}
                onChange={(e) => {
                  const value = e.target.value;

                  setReportType(value);

                  if (value === "custom") {
                    setStartDate("");
                    setEndDate("");
                    setDateStep("from");
                  }
                }}
              >
                <option value="all">
                  All Time
                </option>

                <option value="daily">
                  Daily
                </option>

                <option value="weekly">
                  Weekly
                </option>

                <option value="monthly">
                  Monthly
                </option>

                <option value="yearly">
                  Yearly
                </option>

                <option value="custom">
                  {startDate && endDate
                    ? `${startDate} → ${endDate}`
                    : "Custom Range"}
                </option>
              </select>

            </div>

          </div>

        </div>

      </div>

      {/* ================================================= */}
      {/* TASK TABLE */}
      {/* ================================================= */}

      <div className="flex-1 px-2 md:px-4 pb-6 mt-3">

        <div className="bg-slate-900/40 border border-white/5 rounded-[3rem] p-4 md:p-6 h-full flex flex-col">

          <div className="overflow-auto flex-1">

            <div className="overflow-x-auto">

              <table className="w-full text-left min-w-[900px]">

                <thead>

                  <tr className="text-slate-500 text-[10px] md:text-xs font-black tracking-widest border-b border-white/5">

                    <th className="pb-6 px-4">
                      Task ID
                    </th>

                    <th className="pb-6 px-4">
                      User
                    </th>

                    <th className="pb-6 px-4">
                      Work Detail
                    </th>

                    <th className="pb-6 px-4">
                      Priority
                    </th>

                    <th className="pb-6 px-4">
                      Execution
                    </th>

                    <th className="pb-6 px-4">
                      Time
                    </th>

                    <th className="pb-6 px-4 text-right">
                      Actions
                    </th>

                  </tr>

                </thead>

                <tbody className="divide-y divide-white/5">

                  {filteredData.length === 0 ? (
                    <tr>
                      <td
                        colSpan="7"
                        className="py-16 text-center"
                      >
                        <FileText
                          size={36}
                          className="mx-auto text-slate-700 mb-3"
                        />

                        <p className="text-slate-500 text-xs font-black uppercase tracking-widest">
                          No tasks found
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((act) => (
                      <tr
                        key={act.id}
                        className={`hover:bg-white/[0.03] transition-all group ${
                          isPublic() &&
                          act.status === "Pending"
                            ? "animate-[pulse_1s_infinite] bg-red-500/10 border-l-4 border-red-500"
                            : act.status === "Pending"
                            ? "bg-red-500/5 border-l-4 border-red-500"
                            : act.status ===
                              "In Progress"
                            ? "bg-orange-500/5 border-l-4 border-orange-400"
                            : act.status ===
                              "Completed"
                            ? "bg-green-500/5 border-l-4 border-green-500"
                            : act.status ===
                              "Rejected"
                            ? "bg-red-500/5 border-l-4 border-red-600"
                            : ""
                        }`}
                      >

                        {/* ID */}

                        <td className="py-6 px-4 text-yellow-500 font-black italic text-xs">
                          #{act.id}
                        </td>

                        {/* USER */}

                        <td className="py-6 px-4">

                          <div className="flex items-center gap-3">

                            <img
                              src={getProfileImageUrl(
                                act.profile_pic,
                                getPrimaryStaffName(act)
                              )}
                              alt="profile"
                              className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover border border-yellow-500"
                            />

                            <div>

                              <p className="text-white text-xs md:text-sm font-semibold tracking-wide">
                                {getAssignedStaffLabel(
                                  act
                                )}
                              </p>

                              <p className="text-[9px] text-slate-500">
                                #
                                {getAssignedUserLabel(
                                  act
                                )}
                              </p>

                            </div>

                          </div>

                        </td>

                        {/* WORK DETAIL */}

                        <td className="py-6 px-4">

                          <div className="relative group">

                            <p className="text-white font-bold text-xs md:text-sm">
                              {act.title || "No Title"}
                            </p>

                            {act.status ===
                              "Rejected" &&
                              act.rejection_reason && (
                                <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-[999]">

                                  <div className="bg-red-500 text-white text-[10px] px-3 py-2 rounded-xl shadow-xl max-w-[200px]">
                                    {
                                      act.rejection_reason
                                    }
                                  </div>

                                </div>
                              )}

                          </div>

                          <p className="text-[9px] text-slate-500 uppercase mt-1">
                            {act.category ||
                              "No Category"}
                          </p>

                          {(act.panel_name ||
                            act.panel_code) && (
                            <p className="text-[9px] text-blue-400 mt-1 font-bold">
                              ⚡{" "}
                              {act.panel_code ||
                                "Panel"}{" "}
                              —{" "}
                              {act.panel_name ||
                                "Unnamed Panel"}
                            </p>
                          )}

                        </td>

                        {/* PRIORITY */}

                        <td className="py-6 px-4">

                          <span
                            className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                              act.priority === "High"
                                ? "bg-red-500/20 text-red-400"
                                : act.priority ===
                                  "Medium"
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-green-500/20 text-green-400"
                            }`}
                          >
                            {act.priority || "Low"}
                          </span>

                        </td>

                        {/* STATUS */}

                        <td className="py-6 px-4">

                          {act.status === "Rejected" ? (
                            <span
                              onMouseEnter={(e) => {
                                const rect =
                                  e.currentTarget.getBoundingClientRect();

                                setTooltip({
                                  visible: true,

                                  x:
                                    rect.left +
                                    rect.width / 2,

                                  y: rect.top,

                                  text:
                                    act.rejection_reason ||
                                    "No reason provided",

                                  width: 260,
                                  height: 120,
                                });
                              }}
                              className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-red-500/20 text-red-400 cursor-pointer"
                            >
                              Rejected
                            </span>
                          ) : (
                            <select
                              value={
                                act.status || "Pending"
                              }
                              onChange={(e) =>
                                handleStatusUpdate(
                                  act.id,
                                  e.target.value,
                                  act.user_id
                                )
                              }
                              className={`bg-slate-950 border border-white/10 rounded-lg px-3 py-1 text-[9px] font-black uppercase ${
                                act.status ===
                                "Completed"
                                  ? "text-green-400"
                                  : act.status ===
                                    "In Progress"
                                  ? "text-blue-400"
                                  : "text-yellow-500"
                              }`}
                            >
                              <option value="Pending">
                                Pending
                              </option>

                              <option value="In Progress">
                                In Progress
                              </option>

                              <option value="Completed">
                                Completed
                              </option>
                            </select>
                          )}

                        </td>

                        {/* TIME */}

                        <td className="py-6 px-4 text-[10px] text-slate-400 space-y-1 leading-tight">

                          {act.created_at && (
                            <div>
                              📅{" "}
                              {new Date(
                                act.created_at
                              ).toLocaleString()}
                            </div>
                          )}

                          {act.accepted_at && (
                            <div className="text-blue-400">
                              ▶{" "}
                              {new Date(
                                act.accepted_at
                              ).toLocaleString()}
                            </div>
                          )}

                          {act.completed_at && (
                            <div className="text-green-400">
                              ✅{" "}
                              {new Date(
                                act.completed_at
                              ).toLocaleString()}
                            </div>
                          )}

                          {act.duration && (
                            <div className="text-yellow-500 font-bold">
                              ⏱ {act.duration}
                            </div>
                          )}

                        </td>

                        {/* ACTIONS */}

                        <td className="py-6 px-4 text-right">

                          <div className="flex items-center justify-end gap-3">

                            <button
                              onClick={() => {
                                window.open(
                                  `/task-view/${act.id}`,
                                  "_blank"
                                );

                                setEditMode(false);
                              }}
                              className="p-2 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500 hover:text-white"
                              title="View task"
                            >
                              <Eye size={16} />
                            </button>

                            {!isPublic() && (
                              <>
                                <button
                                  onClick={() => {
                                    localStorage.setItem(
                                      "editTask",
                                      JSON.stringify(act)
                                    );

                                    navigate(
                                      "/assign-tasks"
                                    );
                                  }}
                                  className="p-2 bg-yellow-500/10 text-yellow-500 rounded-lg hover:bg-yellow-500 hover:text-black"
                                  title="Edit task"
                                >
                                  <Edit3 size={16} />
                                </button>

                                <button
                                  onClick={() =>
                                    handleDelete(act.id)
                                  }
                                  className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500 hover:text-white"
                                  title="Delete task"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}

                          </div>

                        </td>

                      </tr>
                    ))
                  )}

                </tbody>

              </table>

            </div>

          </div>

        </div>

      </div>

      {/* ================================================= */}
      {/* GLOBAL REJECTION TOOLTIP */}
      {/* ================================================= */}

      {tooltip.visible && (
        <div
          className="fixed z-[99999] bg-red-950/95 backdrop-blur-xl border border-red-500/30 rounded-2xl shadow-2xl overflow-hidden"
          style={{
            top: Math.max(10, tooltip.y - 20),
            left: tooltip.x,
            width: tooltip.width,
            height: tooltip.height,
            transform: "translateX(-50%)",
          }}
          onMouseLeave={() =>
            setTooltip((prev) => ({
              ...prev,
              visible: false,
            }))
          }
        >

          <div className="bg-red-500 text-white text-[10px] px-3 py-2 rounded-t-2xl">
            Rejection Reason
          </div>

          <textarea
            value={tooltip.text}
            readOnly
            className="w-full h-[calc(100%-32px)] bg-transparent text-white text-xs p-3 outline-none resize-none"
          />

        </div>
      )}

      {/* ================================================= */}
      {/* PREVIEW & EDIT POPUP */}
      {/* ================================================= */}

      {previewTask && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex justify-center items-center z-[200] p-4">

          <div className="bg-slate-900 border border-white/10 p-8 lg:p-12 rounded-[3.5rem] w-full max-w-2xl shadow-2xl relative overflow-y-auto max-h-[90vh]">

            <button
              onClick={() => {
                setPreviewTask(null);
                setEditMode(false);
              }}
              className="absolute top-8 right-8 text-slate-500 hover:text-white"
            >
              <X size={28} />
            </button>

            <div className="flex items-center gap-5 mb-10">

              <div className="p-4 bg-yellow-500 rounded-3xl text-slate-950">
                <FileText size={30} />
              </div>

              <div>

                <h2 className="text-white text-3xl font-black uppercase italic leading-none">
                  {editMode
                    ? "Edit Record"
                    : "Task Analysis"}
                </h2>

                <p className="text-yellow-500 text-[10px] md:text-xs font-black uppercase mt-1">
                  Registry Code: #{previewTask.id}
                </p>

              </div>

            </div>

            <div className="space-y-6">

              <div className="space-y-2">

                <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest ml-2">
                  Subject
                </label>

                {editMode ? (
                  <input
                    className="w-full bg-slate-950 border border-white/10 p-5 rounded-2xl text-white outline-none"
                    value={editData.title || ""}
                    onChange={(e) =>
                      setEditData((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                  />
                ) : (
                  <p className="text-white text-xl font-bold ml-2">
                    {previewTask.title || "No Title"}
                  </p>
                )}

              </div>

              <div className="space-y-2">

                <label className="text-[10px] md:text-xs text-slate-500 font-black uppercase tracking-widest ml-2">
                  Technical Description
                </label>

                {editMode ? (
                  <textarea
                    className="w-full bg-slate-950 border border-white/10 p-5 rounded-2xl text-white h-40 outline-none resize-none"
                    value={editData.description || ""}
                    onChange={(e) =>
                      setEditData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                  />
                ) : (
                  <div className="bg-white/5 p-8 rounded-3xl text-slate-300 italic text-sm leading-relaxed">
                    "
                    {previewTask.description ||
                      "No description"}
                    "
                  </div>
                )}

              </div>

              {Array.isArray(previewTask.media) &&
                previewTask.media.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">

                    {previewTask.media.map(
                      (media, index) => {
                        const path =
                          typeof media === "string"
                            ? media
                            : media?.path || "";

                        if (!path) {
                          return null;
                        }

                        const url =
                          path.startsWith("http://") ||
                          path.startsWith("https://")
                            ? path
                            : `${getApiBaseUrl()}/${path.replace(
                                /^\/+/,
                                ""
                              )}`;

                        const cleanPath =
                          path.split("?")[0];

                        const ext = cleanPath
                          .split(".")
                          .pop()
                          .toLowerCase();

                        return (
                          <div
                            key={`${path}-${index}`}
                            className="bg-black/40 p-3 rounded-xl"
                          >

                            {[
                              "jpg",
                              "jpeg",
                              "png",
                              "gif",
                              "webp",
                            ].includes(ext) && (
                              <img
                                src={url}
                                alt={`Attachment ${
                                  index + 1
                                }`}
                                className="w-full h-40 object-cover rounded"
                              />
                            )}

                            {[
                              "mp4",
                              "mov",
                              "mkv",
                            ].includes(ext) && (
                              <video
                                src={url}
                                controls
                                className="w-full h-40 rounded"
                              />
                            )}

                            {[
                              "mp3",
                              "wav",
                              "ogg",
                              "m4a",
                            ].includes(ext) && (
                              <audio
                                src={url}
                                controls
                                className="w-full"
                              />
                            )}

                            {ext === "webm" && (
                              <video
                                src={url}
                                controls
                                className="w-full h-40 rounded"
                              />
                            )}

                            <a
                              href={url}
                              download
                              className="text-yellow-400 text-xs mt-2 inline-block"
                            >
                              ⬇ Download
                            </a>

                          </div>
                        );
                      }
                    )}

                  </div>
                )}

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-8 border-t border-white/5">

                <p className="text-slate-600 text-[9px] font-black uppercase tracking-widest flex items-center gap-2">

                  <Clock size={14} />

                  Issued:{" "}

                  {previewTask.created_at
                    ? new Date(
                        previewTask.created_at
                      ).toLocaleString()
                    : "N/A"}

                </p>

                <div className="flex gap-4">

                  {editMode ? (
                    <button
                      onClick={handleSaveEdit}
                      className="bg-yellow-500 text-slate-950 px-10 py-4 rounded-2xl font-black text-xs uppercase flex items-center gap-2"
                    >
                      <Save size={18} />

                      Save Updates
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        setPreviewTask(null)
                      }
                      className="bg-yellow-500 text-slate-950 px-12 py-4 rounded-2xl font-black text-xs uppercase"
                    >
                      Confirmed
                    </button>
                  )}

                </div>

              </div>

            </div>

          </div>

        </div>
      )}

      {/* ================================================= */}
      {/* TOAST */}
      {/* ================================================= */}

      {toast && (
        <div className="fixed bottom-5 right-5 bg-yellow-500 text-black px-4 py-3 rounded-xl text-xs font-bold shadow-2xl z-[999999]">
          {toast}
        </div>
      )}

    </div>
  );
}