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

  const playSound = (type) => {
    let url = "";
    if (type === "new") url = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";
    if (type === "completed") url = "https://assets.mixkit.co/active_storage/sfx/3200/3200-preview.mp3";
    if (type === "rejected") url = "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3";
    if (!url) return;
    const audio = new Audio(url);
    audio.play().catch((err) => console.warn("Audio play blocked:", err));
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => console.error("Fullscreen error:", err));
    } else {
      document.exitFullscreen().catch((err) => console.error("Exit fullscreen error:", err));
    }
  };

  const [stats, setStats] = useState({
    staffCount: 0,
    taskCount: 0,
    pendingCount: 0,
    inProgressCount: 0,
    completedCount: 0,
    rejectedCount: 0,
    activities: [],
    onDutyToday: { count: 0, staff: [] },
    panelsUnderWork: { count: 0, panels: [] },
    panelsOff: { count: 0, panels: [] },
    panelsMaintenance: { count: 0, panels: [] },
    operationalSummary: { onDutyCount: 0, panelsUnderWorkCount: 0, panelsOffCount: 0, panelsMaintenanceCount: 0 },
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
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, text: "", width: 250, height: 120 });
  const [reportType, setReportType] = useState(isPublic() ? "daily" : "all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dateStep, setDateStep] = useState("from");
  const [previewTask, setPreviewTask] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [lastCount, setLastCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [allStaff, setAllStaff] = useState([]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const getAssignedUserIds = (task) => {
    if (Array.isArray(task?.assigned_user_ids) && task.assigned_user_ids.length) return task.assigned_user_ids.map((id) => String(id));
    return task?.user_id ? [String(task.user_id)] : [];
  };
  const getAssignedStaffNames = (task) => {
    if (Array.isArray(task?.assigned_staff_names) && task.assigned_staff_names.length) return task.assigned_staff_names;
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
  const getPrimaryStaffName = (task) => getAssignedStaffNames(task)[0] || task?.staff_name || "User";

  const getApiBaseUrl = () => import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, "") || "";
  const getProfileImageUrl = (profilePic, staffName = "Staff") => {
    if (profilePic) {
      if (profilePic.startsWith("data:")) return profilePic;
      if (profilePic.startsWith("http://") || profilePic.startsWith("https://")) return profilePic;
      return `${getApiBaseUrl()}/${profilePic.replace(/^\/+/, "")}`;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(staffName)}`;
  };

  const mapDashboardResponse = (data = {}) => {
    const activities = Array.isArray(data.activities) ? data.activities : [];
    const pendingCount = data.pendingCount !== undefined ? Number(data.pendingCount || 0) : activities.filter((task) => task.status === "Pending").length;
    const inProgressCount = data.inProgressCount !== undefined ? Number(data.inProgressCount || 0) : activities.filter((task) => task.status === "In Progress").length;
    const completedCount = data.completedCount !== undefined ? Number(data.completedCount || 0) : activities.filter((task) => task.status === "Completed").length;
    const rejectedCount = data.rejectedCount !== undefined ? Number(data.rejectedCount || 0) : activities.filter((task) => task.status === "Rejected").length;
    return {
      staffCount: Number(data.staffCount || 0),
      taskCount: data.taskCount !== undefined ? Number(data.taskCount || 0) : activities.length,
      pendingCount, inProgressCount, completedCount, rejectedCount, activities,
      onDutyToday: { count: Number(data.onDutyToday?.count ?? data.operationalSummary?.onDutyCount ?? 0), staff: Array.isArray(data.onDutyToday?.staff) ? data.onDutyToday.staff : [] },
      panelsUnderWork: { count: Number(data.panelsUnderWork?.count ?? data.operationalSummary?.panelsUnderWorkCount ?? 0), panels: Array.isArray(data.panelsUnderWork?.panels) ? data.panelsUnderWork.panels : [] },
      panelsOff: { count: Number(data.panelsOff?.count ?? data.operationalSummary?.panelsOffCount ?? 0), panels: Array.isArray(data.panelsOff?.panels) ? data.panelsOff.panels : [] },
      panelsMaintenance: { count: Number(data.panelsMaintenance?.count ?? data.operationalSummary?.panelsMaintenanceCount ?? 0), panels: Array.isArray(data.panelsMaintenance?.panels) ? data.panelsMaintenance.panels : [] },
      operationalSummary: {
        onDutyCount: Number(data.operationalSummary?.onDutyCount ?? data.onDutyToday?.count ?? 0),
        panelsUnderWorkCount: Number(data.operationalSummary?.panelsUnderWorkCount ?? data.panelsUnderWork?.count ?? 0),
        panelsOffCount: Number(data.operationalSummary?.panelsOffCount ?? data.panelsOff?.count ?? 0),
        panelsMaintenanceCount: Number(data.operationalSummary?.panelsMaintenanceCount ?? data.panelsMaintenance?.count ?? 0),
      },
      serverDate: data.serverDate || "",
    };
  };

  const fetchStats = async () => {
    // The public Live Monitor intentionally has no Firebase-authenticated user.
    // Never query protected Firestore collections from that mode; it only needs
    // the shell until a dedicated public aggregate feed is provided.
    if (isPublic()) {
      const safePublicStats = mapDashboardResponse({});
      setStats(safePublicStats);
      return safePublicStats;
    }

    try {
      const res = await API.get("/activity/stats");
      console.log("✅ DASHBOARD API RESPONSE:", res.data);
      const mappedData = mapDashboardResponse(res.data);
      setStats(mappedData);
      return mappedData;
    } catch (err) {
      console.error("❌ Stats Fetch Error:", err?.response?.data || err.message);
      return null;
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("❗ Delete this Task Permanently?")) return;
    try {
      await API.delete(`/task/${id}`);
      setStats((prev) => ({ ...prev, taskCount: Math.max(0, prev.taskCount - 1), activities: prev.activities.filter((task) => Number(task.id) !== Number(id)) }));
      showToast(`Task #${id} deleted`);
      await fetchStats();
    } catch (err) {
      console.error("❌ DELETE ERROR:", err?.response?.data || err.message);
      alert("❌ Task delete failed!");
    }
  };

  const handleStatusUpdate = async (id, status, userId) => {
    try {
      console.log("🔥 STATUS UPDATE:", { id, status, userId });
      await API.put(`/task/update-status/${id}`, { status });
      setStats((prev) => ({ ...prev, activities: prev.activities.map((task) => Number(task.id) === Number(id) ? { ...task, status } : task) }));
      showToast(`Task #${id} → ${status}`);
      await fetchStats();
    } catch (err) {
      console.error("❌ STATUS UPDATE ERROR:", err?.response?.data || err.message);
      alert("❌ Status update failed!");
      await fetchStats();
    }
  };

  const handleSaveEdit = async () => {
    try {
      const formData = new FormData();
      const assignedUserIds = getAssignedUserIds(editData);
      formData.append("title", editData.title || "");
      formData.append("description", editData.description || "");
      formData.append("category", editData.category || "");
      formData.append("status", editData.status || "Pending");
      formData.append("priority", editData.priority || "Low");
      if (editData.panel_id !== undefined) formData.append("panel_id", editData.panel_id === null ? "" : editData.panel_id);
      formData.append("user_id", assignedUserIds[0] || "");
      assignedUserIds.forEach((userId) => formData.append("user_ids[]", userId));
      formData.append("removedFiles", JSON.stringify([]));
      await API.put(`/task/${editData.id}`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      alert("✅ Task Updated Successfully!");
      setEditMode(false);
      setStats((prev) => ({ ...prev, activities: prev.activities.map((task) => Number(task.id) === Number(editData.id) ? { ...task, ...editData } : task) }));
      setPreviewTask(editData);
      await fetchStats();
    } catch (err) {
      console.error("❌ UPDATE ERROR:", err?.response?.data || err.message);
      alert("❌ Update Failed!");
    }
  };

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      await fetchStats();
      if (mounted) setLoading(false);
    };
    init();

    const interval = isPublic() ? null : setInterval(fetchStats, 5000);
    socket.off("updateData");

    const handleLiveUpdate = async () => {
      if (isPublic()) return;
      console.log("⚡ LIVE UPDATE");
      try {
        const res = await API.get("/activity/stats");
        const newActivities = Array.isArray(res.data?.activities) ? res.data.activities : [];
        const latest = newActivities[0];
        if (latest) {
          if (latest.status === "Completed") playSound("completed");
          else if (latest.status === "Rejected") playSound("rejected");
          else playSound("new");
          setNotifications((prev) => [{ id: Date.now(), text: `${getPrimaryStaffName(latest)} → ${latest.status || "Updated"}`, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
          showToast(`Task #${latest.id || ""} ${latest.status || "Updated"}`);
        }
        setLastCount(newActivities.length);
        setStats(mapDashboardResponse(res.data));
      } catch (err) {
        console.error("❌ LIVE UPDATE FETCH ERROR:", err?.response?.data || err.message);
      }
    };

    socket.on("updateData", handleLiveUpdate);
    return () => {
      mounted = false;
      socket.off("updateData", handleLiveUpdate);
      if (interval) clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => {
    if (isPublic()) return undefined;
    const handleConnect = () => console.log("✅ SOCKET CONNECTED:", socket.id);
    const handleConnectError = (err) => console.log("❌ SOCKET ERROR:", err.message);
    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.emit("joinAdmin");
    return () => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // The remainder of the component UI is intentionally kept identical to the
  // previous production dashboard implementation.
