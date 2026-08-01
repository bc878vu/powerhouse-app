import React, { useEffect, useState, useCallback } from "react";
import API from "./api";
import { getUser } from "./utils/auth";

import {
  Clock,
  ListTodo,
  ArrowRight,
  Layers,
  LayoutGrid,
  Calendar,
  Zap,
  MapPin,
  Wrench,
  AlertCircle,
  CheckCircle,
  XCircle,
  Bell,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

import { useNavigate } from "react-router-dom";
import { socket } from "./utils/socket";
import { onMessageListener } from "./firebaseConfig";

export default function UserDashboard() {
  const user = getUser();
  const navigate = useNavigate();

  // =========================================================
  // STATES
  // =========================================================

  const [tasks, setTasks] = useState([]);
  const [popup, setPopup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingTaskId, setAcceptingTaskId] = useState(null);

  // =========================================================
  // POPUP
  // =========================================================

  const showPopup = useCallback((title, msg, type = "info") => {
    setPopup({
      title,
      msg,
      type,
    });

    setTimeout(() => {
      setPopup(null);
    }, 3000);
  }, []);

  // =========================================================
  // NOTIFICATION SOUND
  // =========================================================

  const playNotificationSound = useCallback(() => {
    try {
      const audio = new Audio("/notification.mp3");

      audio.volume = 1;

      audio.play().catch(() => {
        console.log("Sound blocked by browser");
      });
    } catch (err) {
      console.log("Sound error:", err);
    }
  }, []);

  // =========================================================
  // FETCH TASKS
  // =========================================================

  const fetchTasks = useCallback(
    async (showRefreshLoader = false) => {
      if (!user?.id) {
        setTasks([]);
        setLoading(false);
        return;
      }

      try {
        if (showRefreshLoader) {
          setRefreshing(true);
        }

        const res = await API.get(`/task/my-tasks/${user.id}`);

        const receivedTasks = Array.isArray(res.data)
          ? res.data
          : [];

        console.log(
          "✅ USER DASHBOARD TASKS:",
          receivedTasks
        );

        setTasks(receivedTasks);
      } catch (err) {
        console.error(
          "❌ Task fetch error:",
          err?.response?.data || err.message
        );

        setTasks([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id]
  );

  // =========================================================
  // ACCEPT TASK
  // =========================================================

  const handleAccept = async (task) => {
    if (!task?.id) return;

    try {
      setAcceptingTaskId(task.id);

      await API.put(`/task/update-status/${task.id}`, {
        status: "In Progress",
      });

      setTasks((prev) =>
        prev.map((item) =>
          Number(item.id) === Number(task.id)
            ? {
                ...item,
                status: "In Progress",
                accepted_at:
                  item.accepted_at ||
                  new Date().toISOString(),
              }
            : item
        )
      );

      showPopup(
        "Task Accepted",
        `Task #${task.id} is now In Progress`,
        "success"
      );

      await fetchTasks();
    } catch (err) {
      console.error(
        "❌ ACCEPT TASK ERROR:",
        err?.response?.data || err.message
      );

      showPopup(
        "Accept Failed",
        err?.response?.data?.message ||
          "Could not accept this task",
        "error"
      );
    } finally {
      setAcceptingTaskId(null);
    }
  };

  // =========================================================
  // INITIAL FETCH + POLLING
  // =========================================================

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return undefined;
    }

    fetchTasks();

    const interval = setInterval(() => {
      fetchTasks();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [user?.id, fetchTasks]);

  // =========================================================
  // SOCKET.IO LIVE NOTIFICATIONS
  // =========================================================

  useEffect(() => {
    if (!user?.id) {
      return undefined;
    }

    if (typeof Notification !== "undefined") {
      Notification.requestPermission().catch(() => {});
    }

    socket.emit("joinUser", user.id);

    const handleTaskAssigned = async (data) => {
      console.log("⚡ NEW TASK ASSIGNED:", data);

      await fetchTasks();

      showPopup(
        "New Task Assigned",
        data?.title || "You received a new task",
        "new"
      );

      playNotificationSound();

      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        try {
          new Notification("New Task Assigned", {
            body:
              data?.title ||
              "You received a new task",
          });
        } catch (err) {
          console.log(
            "Browser notification error:",
            err
          );
        }
      }
    };

    const handleTaskUpdate = async (data) => {
      console.log("⚡ TASK UPDATED:", data);

      await fetchTasks();

      if (data?.status) {
        showPopup(
          "Task Update",
          `Task ${
            data?.taskId || data?.id
              ? `#${
                  data?.taskId || data?.id
                }`
              : ""
          } → ${data.status}`,
          data.status === "Completed"
            ? "success"
            : data.status === "Rejected"
            ? "error"
            : "info"
        );
      }
    };

    socket.on("taskAssigned", handleTaskAssigned);
    socket.on("taskUpdate", handleTaskUpdate);

    return () => {
      socket.off("taskAssigned", handleTaskAssigned);
      socket.off("taskUpdate", handleTaskUpdate);
    };
  }, [
    user?.id,
    fetchTasks,
    showPopup,
    playNotificationSound,
  ]);

  // =========================================================
  // FIREBASE FOREGROUND NOTIFICATION
  // =========================================================

  useEffect(() => {
    let isMounted = true;

    onMessageListener()
      .then((payload) => {
        if (!isMounted || !payload) return;

        console.log(
          "🔥 FIREBASE FOREGROUND MESSAGE:",
          payload
        );

        const taskId =
          payload?.data?.taskId ||
          payload?.data?.task_id;

        const title =
          payload?.notification?.title ||
          "Task Notification";

        const message =
          payload?.notification?.body ||
          payload?.data?.message ||
          "You have a task update";

        showPopup(title, message, "new");

        playNotificationSound();

        fetchTasks();

        if (taskId) {
          const shouldOpen = window.confirm(
            `${message}\n\nOpen task #${taskId}?`
          );

          if (shouldOpen) {
            window.open(
              `/task-view/${taskId}`,
              "_blank"
            );
          }
        }
      })
      .catch((err) => {
        console.error(
          "Firebase foreground listener error:",
          err
        );
      });

    return () => {
      isMounted = false;
    };
  }, [
    fetchTasks,
    playNotificationSound,
    showPopup,
  ]);

  // =========================================================
  // TASK COUNTS
  // =========================================================

  const pendingCount = tasks.filter(
    (task) => task.status === "Pending"
  ).length;

  const runningCount = tasks.filter(
    (task) => task.status === "In Progress"
  ).length;

  const completedCount = tasks.filter(
    (task) => task.status === "Completed"
  ).length;

  const rejectedCount = tasks.filter(
    (task) => task.status === "Rejected"
  ).length;

  // =========================================================
  // SORT RECENT TASKS
  // =========================================================

  const recentTasks = [...tasks]
    .sort((a, b) => {
      return (
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
      );
    })
    .slice(0, 5);

  // =========================================================
  // STATUS STYLE
  // =========================================================

  const getStatusStyle = (status) => {
    if (status === "Completed") {
      return {
        bg: "bg-green-500/10",
        text: "text-green-400",
        border: "border-green-500/20",
        icon: <CheckCircle size={13} />,
      };
    }

    if (status === "In Progress") {
      return {
        bg: "bg-blue-500/10",
        text: "text-blue-400",
        border: "border-blue-500/20",
        icon: <Layers size={13} />,
      };
    }

    if (status === "Rejected") {
      return {
        bg: "bg-red-500/10",
        text: "text-red-400",
        border: "border-red-500/20",
        icon: <XCircle size={13} />,
      };
    }

    return {
      bg: "bg-yellow-500/10",
      text: "text-yellow-500",
      border: "border-yellow-500/20",
      icon: <Clock size={13} />,
    };
  };

  // =========================================================
  // LOADING
  // =========================================================

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw
            size={35}
            className="text-yellow-500 animate-spin mx-auto mb-4"
          />

          <p className="text-yellow-500 font-black text-xs uppercase tracking-widest">
            Loading Your Tasks...
          </p>
        </div>
      </div>
    );
  }

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="animate-in fade-in duration-700">

      {/* ================================================= */}
      {/* HERO */}
      {/* ================================================= */}

      <div className="bg-yellow-500 p-6 md:p-12 rounded-[2.5rem] md:rounded-[3.5rem] mb-8 md:mb-12 flex flex-col md:flex-row justify-between items-center shadow-2xl relative overflow-hidden group">

        <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full" />

        <div className="absolute -left-20 -bottom-24 w-64 h-64 bg-slate-900/5 rounded-full" />

        <div className="relative z-10 w-full md:w-auto">

          <p className="text-slate-900 font-black text-[10px] uppercase tracking-[0.4em] mb-3">
            User Terminal
          </p>

          <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-slate-900 italic uppercase leading-none">
            Hello, {user?.name || "User"}
          </h1>

          <div className="flex flex-wrap gap-3 md:gap-4 mt-4">

            <span className="bg-slate-900 text-white px-4 py-1.5 rounded-xl text-[9px] font-black uppercase shadow-lg italic">
              ID: #{user?.id || "N/A"}
            </span>

            <span className="bg-white/20 px-4 py-1.5 rounded-xl text-[9px] font-black text-slate-900 uppercase italic">
              Tasks Assigned: {tasks.length}
            </span>

            {pendingCount > 0 && (
              <span className="bg-red-500 text-white px-4 py-1.5 rounded-xl text-[9px] font-black uppercase shadow-lg animate-pulse">
                {pendingCount} Pending
              </span>
            )}

          </div>

        </div>

        <div className="relative z-10 flex flex-col sm:flex-row gap-3 mt-8 md:mt-0">

          <button
            onClick={() => fetchTasks(true)}
            disabled={refreshing}
            className="bg-white/20 text-slate-900 p-5 rounded-[2rem] font-black hover:bg-white/30 transition-all disabled:opacity-50"
            title="Refresh Tasks"
          >
            <RefreshCw
              size={20}
              className={
                refreshing ? "animate-spin" : ""
              }
            />
          </button>

          <button
            onClick={() => navigate("/my-tasks")}
            className="bg-slate-900 text-white px-8 md:px-10 py-5 rounded-[2rem] font-black text-[11px] uppercase flex items-center justify-center gap-4 hover:scale-105 transition-all shadow-2xl group"
          >
            Go To My Tasks

            <ArrowRight
              size={20}
              className="group-hover:translate-x-2 transition-transform"
            />
          </button>

        </div>

      </div>

      {/* ================================================= */}
      {/* STATS CARDS */}
      {/* ================================================= */}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8 md:mb-12">

        {[
          {
            label: "To Do",
            count: pendingCount,
            color: "text-yellow-500",
            bg: "bg-yellow-500/10",
            icon: <Clock />,
          },

          {
            label: "Running",
            count: runningCount,
            color: "text-blue-400",
            bg: "bg-blue-500/10",
            icon: <Layers />,
          },

          {
            label: "Completed",
            count: completedCount,
            color: "text-green-400",
            bg: "bg-green-500/10",
            icon: <ListTodo />,
          },

          {
            label: "Rejected",
            count: rejectedCount,
            color: "text-red-400",
            bg: "bg-red-500/10",
            icon: <XCircle />,
          },

          {
            label: "Total",
            count: tasks.length,
            color: "text-yellow-400",
            bg: "bg-yellow-500/10",
            icon: <LayoutGrid />,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-slate-900/60 border border-white/5 p-5 rounded-[2rem] flex items-center justify-between shadow-xl hover:border-white/10 transition-all"
          >

            <div>

              <div
                className={`${item.bg} ${item.color} p-2 rounded-xl mb-3 inline-block`}
              >
                {item.icon}
              </div>

              <h3 className="text-3xl md:text-4xl font-black text-white italic">
                {item.count}
              </h3>

              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-2">
                {item.label}
              </p>

            </div>

            <LayoutGrid
              className="text-white/[0.03]"
              size={50}
            />

          </div>
        ))}

      </div>

      {/* ================================================= */}
      {/* RECENT TASK TIMELINE */}
      {/* ================================================= */}

      <div className="bg-slate-900/40 border border-white/5 p-5 md:p-10 rounded-[2.5rem] md:rounded-[3rem] shadow-2xl">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">

          <div>

            <h3 className="text-white font-black text-xl uppercase italic">
              Recent Task Timeline
            </h3>

            <p className="text-slate-500 text-[9px] uppercase tracking-widest mt-2">
              Latest 5 assigned tasks
            </p>

          </div>

          <button
            onClick={() => navigate("/my-tasks")}
            className="text-yellow-500 text-[10px] font-black uppercase flex items-center gap-2 hover:gap-3 transition-all"
          >
            View All Tasks

            <ArrowRight size={15} />
          </button>

        </div>

        <div className="grid gap-4">

          {recentTasks.length > 0 ? (
            recentTasks.map((task) => {
              const statusStyle = getStatusStyle(
                task.status
              );

              return (
                <div
                  key={task.id}
                  onClick={() =>
                    window.open(
                      `/task-view/${task.id}`,
                      "_blank"
                    )
                  }
                  className={`p-5 md:p-6 bg-white/[0.03] border ${statusStyle.border} rounded-[2rem] hover:bg-white/[0.08] transition-all cursor-pointer`}
                >

                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">

                    {/* LEFT */}

                    <div className="flex items-start gap-4 md:gap-5 min-w-0">

                      <div className="w-12 h-12 shrink-0 bg-slate-800 rounded-2xl flex items-center justify-center text-yellow-500 font-black italic shadow-lg">
                        #{task.id}
                      </div>

                      <div className="min-w-0">

                        <h4 className="text-white font-bold text-base tracking-tight">
                          {task.title || "No Title"}
                        </h4>

                        <p className="text-slate-500 text-[10px] font-black uppercase mt-2 flex items-center gap-2 italic">
                          <Calendar size={12} />

                          {task.created_at
                            ? new Date(
                                task.created_at
                              ).toLocaleString()
                            : "N/A"}
                        </p>

                        {/* PANEL INFO */}

                        {task.panel_id && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">

                            <span className="inline-flex items-center gap-1.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase">

                              <Zap size={12} />

                              {task.panel_code ||
                                `Panel #${task.panel_id}`}

                            </span>

                            {task.panel_name && (
                              <span className="text-slate-300 text-[10px] font-bold">
                                {task.panel_name}
                              </span>
                            )}

                          </div>
                        )}

                        {(task.panel_area ||
                          task.panel_location) && (
                          <p className="text-slate-500 text-[9px] mt-2 flex items-center gap-1">

                            <MapPin size={11} />

                            {[
                              task.panel_area,
                              task.panel_location,
                            ]
                              .filter(Boolean)
                              .join(" • ")}

                          </p>
                        )}

                      </div>

                    </div>

                    {/* RIGHT */}

                    <div className="flex flex-wrap items-center gap-3 lg:justify-end">

                      <span
                        className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-[9px] font-black uppercase ${statusStyle.bg} ${statusStyle.text}`}
                      >
                        {statusStyle.icon}

                        {task.status || "Pending"}
                      </span>

                      {task.status === "Pending" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();

                            handleAccept(task);
                          }}
                          disabled={
                            acceptingTaskId === task.id
                          }
                          className="bg-blue-500 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {acceptingTaskId === task.id
                            ? "Accepting..."
                            : "Accept"}
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();

                          window.open(
                            `/task-view/${task.id}`,
                            "_blank"
                          );
                        }}
                        className="p-2.5 bg-white/5 text-slate-400 hover:text-yellow-500 hover:bg-yellow-500/10 rounded-xl transition-all"
                        title="Open Task"
                      >
                        <ExternalLink size={16} />
                      </button>

                    </div>

                  </div>

                  {/* REJECTION REASON */}

                  {task.status === "Rejected" &&
                    task.rejection_reason && (
                      <div className="mt-4 ml-0 md:ml-[68px] bg-red-500/5 border border-red-500/10 rounded-2xl p-4">

                        <div className="flex items-start gap-2">

                          <AlertCircle
                            size={15}
                            className="text-red-400 shrink-0 mt-0.5"
                          />

                          <div>

                            <p className="text-red-400 text-[9px] font-black uppercase tracking-widest mb-1">
                              Rejection Reason
                            </p>

                            <p className="text-slate-300 text-xs leading-relaxed">
                              {task.rejection_reason}
                            </p>

                          </div>

                        </div>

                      </div>
                    )}

                </div>
              );
            })
          ) : (
            <div className="text-center py-16">

              <ListTodo
                size={40}
                className="mx-auto text-slate-700 mb-4"
              />

              <p className="text-slate-600 font-bold uppercase tracking-widest italic">
                No tasks assigned yet
              </p>

            </div>
          )}

        </div>

      </div>

      {/* ================================================= */}
      {/* POPUP NOTIFICATION */}
      {/* ================================================= */}

      {popup && (
        <div
          className={`fixed top-5 right-5 max-w-sm px-6 py-4 rounded-2xl shadow-2xl z-[99999] border animate-in slide-in-from-right duration-300 ${
            popup.type === "success"
              ? "bg-green-500 text-white border-green-400"
              : popup.type === "error"
              ? "bg-red-500 text-white border-red-400"
              : popup.type === "new"
              ? "bg-yellow-500 text-black border-yellow-400"
              : "bg-blue-500 text-white border-blue-400"
          }`}
        >

          <div className="flex items-start gap-3">

            <Bell
              size={19}
              className="shrink-0 mt-0.5"
            />

            <div>

              <h4 className="font-black text-sm">
                {popup.title}
              </h4>

              <p className="text-sm mt-1 opacity-90">
                {popup.msg}
              </p>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}