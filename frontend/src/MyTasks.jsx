import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";

import API from "./api";
import { getUser } from "./utils/auth";

import {
  CheckCircle,
  Clock,
  AlertCircle,
  X,
  Upload,
  Mic,
  Square,
  Trash2,
  FileText,
  Image as ImageIcon,
  Video,
  Send,
  Loader2,
  PlayCircle,
  Paperclip,
  Camera,
  VideoIcon,
  RotateCcw,
  Timer,
  History,
  Ban,
  CalendarClock,
} from "lucide-react";

import { socket } from "./utils/socket";

export default function MyTasks() {
  const user = getUser();

  // ============================================================
  // MAIN TASK STATE
  // ============================================================

  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Refresh running cycle timers every second.
  const [, setClockTick] = useState(0);

  // ============================================================
  // ACTION LOADING STATE
  // ============================================================

  const [acceptingId, setAcceptingId] = useState(null);

  // ============================================================
  // REJECT STATE
  // ============================================================

  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectLoading, setRejectLoading] = useState(false);

  // ============================================================
  // COMPLETION MODAL STATE
  // ============================================================

  const [completionTask, setCompletionTask] = useState(null);
  const [completionNote, setCompletionNote] = useState("");
  const [completionFiles, setCompletionFiles] = useState([]);

  const [submittingCompletion, setSubmittingCompletion] =
    useState(false);

  // ============================================================
  // MULTIPLE VOICE NOTES
  // ============================================================

  const [voiceNotes, setVoiceNotes] = useState([]);

  const [isRecordingVoice, setIsRecordingVoice] =
    useState(false);

  const [voiceRecordingSeconds, setVoiceRecordingSeconds] =
    useState(0);

  // ============================================================
  // PHOTO CAMERA STATE
  // ============================================================

  const [showPhotoCamera, setShowPhotoCamera] =
    useState(false);

  const [photoCameraReady, setPhotoCameraReady] =
    useState(false);

  // ============================================================
  // VIDEO RECORDING STATE
  // ============================================================

  const [showVideoCamera, setShowVideoCamera] =
    useState(false);

  const [isRecordingVideo, setIsRecordingVideo] =
    useState(false);

  const [videoRecordingSeconds, setVideoRecordingSeconds] =
    useState(0);

  // ============================================================
  // REFS
  // ============================================================

  const fileInputRef = useRef(null);

  const voiceRecorderRef = useRef(null);
  const voiceStreamRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const voiceTimerRef = useRef(null);
  const voiceRecordingSecondsRef = useRef(0);

  const photoVideoRef = useRef(null);
  const photoCanvasRef = useRef(null);
  const photoStreamRef = useRef(null);

  const recordedVideoRef = useRef(null);
  const videoStreamRef = useRef(null);
  const videoRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);
  const videoTimerRef = useRef(null);

  // ============================================================
  // BASIC HELPERS
  // ============================================================

  const toValidDate = (value) => {
    if (!value) return null;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  };

  const formatDateTime = (value) => {
    const date = toValidDate(value);

    if (!date) return "N/A";

    return date.toLocaleString();
  };

  const normalizeStatus = (status) => {
    return String(status || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, " ");
  };

  // ============================================================
  // COMPLETE ASSIGNMENT HISTORY HELPERS
  // OLD + NEW + UPDATED + REASSIGNED CYCLES
  // ============================================================

  const getCurrentUserHistory = (task) => {
    const history = Array.isArray(task?.assignment_history)
      ? task.assignment_history
      : [];

    if (!history.length) {
      return [];
    }

    const currentUserId = String(user?.id || "");

    return history
      .filter((item) => {
        if (!currentUserId) return true;

        return String(item?.user_id || "") === currentUserId;
      })
      .sort((a, b) => {
        const cycleA = Number(
          a?.assignment_cycle ||
            a?.cycle_number ||
            a?.cycle ||
            0
        );

        const cycleB = Number(
          b?.assignment_cycle ||
            b?.cycle_number ||
            b?.cycle ||
            0
        );

        if (cycleB !== cycleA) {
          return cycleB - cycleA;
        }

        const dateA =
          toValidDate(a?.assigned_at)?.getTime() || 0;

        const dateB =
          toValidDate(b?.assigned_at)?.getTime() || 0;

        return dateB - dateA;
      });
  };

  // ============================================================
  // GET ALL UNIQUE ASSIGNMENT CYCLES
  // ============================================================

  const getAssignmentCycles = (task) => {
    const userHistory = getCurrentUserHistory(task);

    if (!userHistory.length) {
      return [];
    }

    const cycleMap = new Map();

    userHistory.forEach((item, index) => {
      let cycleNumber = Number(
        item?.assignment_cycle ||
          item?.cycle_number ||
          item?.cycle ||
          0
      );

      if (
        !Number.isFinite(cycleNumber) ||
        cycleNumber <= 0
      ) {
        cycleNumber = index + 1;
      }

      const normalizedCycle = {
        ...item,
        assignment_cycle: cycleNumber,
      };

      const existing = cycleMap.get(cycleNumber);

      if (!existing) {
        cycleMap.set(cycleNumber, normalizedCycle);
        return;
      }

      // Merge duplicate records of the same cycle so that
      // old timestamps are never lost.
      cycleMap.set(cycleNumber, {
        ...existing,
        ...normalizedCycle,

        assigned_at:
          normalizedCycle.assigned_at ||
          existing.assigned_at ||
          null,

        accepted_at:
          normalizedCycle.accepted_at ||
          existing.accepted_at ||
          null,

        completed_at:
          normalizedCycle.completed_at ||
          existing.completed_at ||
          null,

        rejected_at:
          normalizedCycle.rejected_at ||
          existing.rejected_at ||
          null,

        rejection_reason:
          normalizedCycle.rejection_reason ||
          existing.rejection_reason ||
          null,
      });
    });

    return Array.from(cycleMap.values()).sort(
      (a, b) =>
        Number(a.assignment_cycle) -
        Number(b.assignment_cycle)
    );
  };

  // ============================================================
  // CURRENT ASSIGNMENT
  // ============================================================

  const getCurrentAssignment = (task) => {
    const cycles = getAssignmentCycles(task);

    if (cycles.length > 0) {
      return cycles[cycles.length - 1];
    }

    return null;
  };

  // ============================================================
  // CURRENT ASSIGNMENT FIELD HELPERS
  // ============================================================

  const getCurrentStatus = (task) => {
    const assignment = getCurrentAssignment(task);

    return assignment?.status || task?.status || "Pending";
  };

  const getCurrentAssignedAt = (task) => {
    const assignment = getCurrentAssignment(task);

    return (
      assignment?.assigned_at ||
      task?.assigned_at ||
      task?.created_at ||
      null
    );
  };

  const getCurrentAcceptedAt = (task) => {
    const assignment = getCurrentAssignment(task);

    if (assignment) {
      return assignment.accepted_at || null;
    }

    return task?.accepted_at || null;
  };

  const getCurrentCompletedAt = (task) => {
    const assignment = getCurrentAssignment(task);

    if (assignment) {
      return assignment.completed_at || null;
    }

    return task?.completed_at || null;
  };

  const getCurrentRejectedAt = (task) => {
    const assignment = getCurrentAssignment(task);

    if (assignment) {
      return assignment.rejected_at || null;
    }

    return task?.rejected_at || null;
  };

  const getCurrentRejectionReason = (task) => {
    const assignment = getCurrentAssignment(task);

    if (assignment) {
      return assignment.rejection_reason || "";
    }

    return task?.rejection_reason || "";
  };

  const getCurrentDueAt = (task) => {
    const assignment = getCurrentAssignment(task);

    return (
      assignment?.due_at ||
      task?.due_at ||
      task?.deadline ||
      task?.expected_completion_at ||
      task?.due_date ||
      null
    );
  };

  // ============================================================
  // STATUS HELPERS
  // ============================================================

  const isPendingTask = (task) => {
    return normalizeStatus(getCurrentStatus(task)) === "pending";
  };

  const isInProgressTask = (task) => {
    const status = normalizeStatus(getCurrentStatus(task));

    return (
      status === "in progress" ||
      status === "running"
    );
  };

  const isCompletedTask = (task) => {
    return (
      normalizeStatus(getCurrentStatus(task)) === "completed"
    );
  };

  const isRejectedTask = (task) => {
    return (
      normalizeStatus(getCurrentStatus(task)) === "rejected"
    );
  };

  // ============================================================
  // COMPLETE CYCLE COUNT
  // ============================================================

  const getAssignmentCount = (task) => {
    const cycles = getAssignmentCycles(task);

    if (cycles.length > 0) {
      return cycles.length;
    }

    const possibleValues = [
      task?.assignment_count,
      task?.repeat_count,
      task?.reassignment_count,
      task?.assigned_count,
      task?.assignment_cycle,
      task?.cycle_number,
    ];

    for (const value of possibleValues) {
      const number = Number(value);

      if (Number.isFinite(number) && number > 0) {
        return Math.floor(number);
      }
    }

    return 1;
  };

  const getCurrentCycleNumber = (task) => {
    const cycles = getAssignmentCycles(task);

    if (cycles.length > 0) {
      return Math.max(
        ...cycles.map(
          (cycle) =>
            Number(cycle.assignment_cycle) || 1
        )
      );
    }

    return getAssignmentCount(task);
  };

  const isRepeatedTask = (task) => {
    return getAssignmentCount(task) > 1;
  };

  // ============================================================
  // INDIVIDUAL CYCLE WORK TIME
  // ============================================================

  const getCycleWorkTimeMs = (cycle) => {
    if (!cycle) return 0;

    const status = normalizeStatus(cycle?.status);

    const assignedAt = toValidDate(cycle?.assigned_at);
    const acceptedAt = toValidDate(cycle?.accepted_at);
    const completedAt = toValidDate(cycle?.completed_at);
    const rejectedAt = toValidDate(cycle?.rejected_at);

    // Work starts from accepted time where available.
    // Otherwise assigned time is used as fallback.
    const startDate = acceptedAt || assignedAt;

    if (!startDate) {
      return 0;
    }

    // Completed cycle
    if (completedAt) {
      return Math.max(
        0,
        completedAt.getTime() - startDate.getTime()
      );
    }

    // Rejected cycle
    if (rejectedAt) {
      return Math.max(
        0,
        rejectedAt.getTime() - startDate.getTime()
      );
    }

    // Current running cycle
    if (
      status === "in progress" ||
      status === "running"
    ) {
      return Math.max(
        0,
        Date.now() - startDate.getTime()
      );
    }

    return 0;
  };

  // ============================================================
  // FALLBACK CURRENT TASK WORK TIME
  // ============================================================

  const getFallbackTaskWorkTimeMs = (task) => {
    const assignedAt = toValidDate(
      task?.assigned_at || task?.created_at
    );

    const acceptedAt = toValidDate(task?.accepted_at);
    const completedAt = toValidDate(task?.completed_at);
    const rejectedAt = toValidDate(task?.rejected_at);

    const startDate = acceptedAt || assignedAt;

    if (!startDate) {
      return 0;
    }

    if (completedAt) {
      return Math.max(
        0,
        completedAt.getTime() - startDate.getTime()
      );
    }

    if (rejectedAt) {
      return Math.max(
        0,
        rejectedAt.getTime() - startDate.getTime()
      );
    }

    if (isInProgressTask(task)) {
      return Math.max(
        0,
        Date.now() - startDate.getTime()
      );
    }

    return 0;
  };

  // ============================================================
  // TOTAL OLD + NEW COMBINED WORK TIME
  // ============================================================

  const getTotalCombinedWorkTimeMs = (task) => {
    const cycles = getAssignmentCycles(task);

    if (!cycles.length) {
      return getFallbackTaskWorkTimeMs(task);
    }

    return cycles.reduce((total, cycle) => {
      return total + getCycleWorkTimeMs(cycle);
    }, 0);
  };

  // ============================================================
  // FULL DURATION FORMAT
  // ============================================================

  const formatFullDurationFromMs = (milliseconds) => {
    const totalSeconds = Math.max(
      0,
      Math.floor(Number(milliseconds || 0) / 1000)
    );

    const days = Math.floor(totalSeconds / 86400);

    const hours = Math.floor(
      (totalSeconds % 86400) / 3600
    );

    const minutes = Math.floor(
      (totalSeconds % 3600) / 60
    );

    const seconds = totalSeconds % 60;

    const parts = [];

    if (days > 0) {
      parts.push(`${days}d`);
    }

    if (hours > 0) {
      parts.push(`${hours}h`);
    }

    if (minutes > 0) {
      parts.push(`${minutes}m`);
    }

    if (seconds > 0 || parts.length === 0) {
      parts.push(`${seconds}s`);
    }

    return parts.join(" ");
  };

  // ============================================================
  // DEADLINE / TIME LIMIT HELPERS
  // ============================================================

  const getTaskStartDate = (task) => {
    return (
      toValidDate(getCurrentAssignedAt(task)) ||
      toValidDate(task?.reassigned_at) ||
      toValidDate(task?.created_at)
    );
  };

  const getTaskDeadline = (task) => {
    const explicitDeadline = toValidDate(
      getCurrentDueAt(task)
    );

    if (explicitDeadline) {
      return explicitDeadline;
    }

    const allowedMinutes = Number(
      task?.time_limit_minutes ??
        task?.estimated_minutes ??
        task?.allowed_minutes ??
        0
    );

    const startDate = getTaskStartDate(task);

    if (
      startDate &&
      Number.isFinite(allowedMinutes) &&
      allowedMinutes > 0
    ) {
      return new Date(
        startDate.getTime() +
          allowedMinutes * 60 * 1000
      );
    }

    return null;
  };

  const getTimePerformance = (task) => {
    const assignment = getCurrentAssignment(task);

    const deadline = getTaskDeadline(task);

    if (!deadline) {
      return {
        hasDeadline: false,
        deadline: null,
        isOverdue: false,
        completedLate: false,
        rejectedLate: false,
        exceededMs: 0,
        exceededMinutes: 0,
      };
    }

    const completedDate = toValidDate(
      getCurrentCompletedAt(task)
    );

    const rejectedDate = toValidDate(
      getCurrentRejectedAt(task)
    );

    const backendExceededMinutes = Number(
      assignment?.exceeded_minutes ??
        task?.exceeded_minutes ??
        0
    );

    if (isCompletedTask(task) && completedDate) {
      const calculatedExceededMs =
        completedDate.getTime() - deadline.getTime();

      const exceededMs =
        backendExceededMinutes > 0
          ? backendExceededMinutes * 60000
          : Math.max(0, calculatedExceededMs);

      return {
        hasDeadline: true,
        deadline,
        isOverdue: false,
        completedLate: exceededMs > 0,
        rejectedLate: false,
        exceededMs,
        exceededMinutes: Math.floor(
          exceededMs / 60000
        ),
      };
    }

    if (isRejectedTask(task) && rejectedDate) {
      const calculatedExceededMs =
        rejectedDate.getTime() - deadline.getTime();

      const exceededMs =
        backendExceededMinutes > 0
          ? backendExceededMinutes * 60000
          : Math.max(0, calculatedExceededMs);

      return {
        hasDeadline: true,
        deadline,
        isOverdue: false,
        completedLate: false,
        rejectedLate: exceededMs > 0,
        exceededMs,
        exceededMinutes: Math.floor(
          exceededMs / 60000
        ),
      };
    }

    const exceededMs =
      Date.now() - deadline.getTime();

    return {
      hasDeadline: true,
      deadline,
      isOverdue:
        !isCompletedTask(task) &&
        !isRejectedTask(task) &&
        exceededMs > 0,
      completedLate: false,
      rejectedLate: false,
      exceededMs: Math.max(0, exceededMs),
      exceededMinutes: Math.max(
        0,
        Math.floor(exceededMs / 60000)
      ),
    };
  };

  const formatDurationFromMs = (milliseconds) => {
    const totalMinutes = Math.max(
      0,
      Math.floor(
        Number(milliseconds || 0) / 60000
      )
    );

    const days = Math.floor(totalMinutes / 1440);

    const hours = Math.floor(
      (totalMinutes % 1440) / 60
    );

    const minutes = totalMinutes % 60;

    const parts = [];

    if (days > 0) {
      parts.push(`${days}d`);
    }

    if (hours > 0) {
      parts.push(`${hours}h`);
    }

    if (minutes > 0 || parts.length === 0) {
      parts.push(`${minutes}m`);
    }

    return parts.join(" ");
  };

  // ============================================================
  // NORMALIZE TASK FROM API
  // ============================================================

  const normalizeTaskFromApi = (task) => {
    const currentAssignment = getCurrentAssignment(task);

    if (!currentAssignment) {
      return task;
    }

    return {
      ...task,

      status:
        currentAssignment.status ||
        task.status ||
        "Pending",

      assignment_cycle:
        currentAssignment.assignment_cycle ||
        task.assignment_cycle ||
        1,

      assignment_count:
        getAssignmentCount(task),

      assigned_at:
        currentAssignment.assigned_at ||
        task.assigned_at ||
        task.created_at,

      accepted_at:
        currentAssignment.accepted_at || null,

      completed_at:
        currentAssignment.completed_at || null,

      rejected_at:
        currentAssignment.rejected_at || null,

      rejection_reason:
        currentAssignment.rejection_reason || null,

      due_at:
        currentAssignment.due_at ||
        task.due_at ||
        null,

      time_exceeded:
        currentAssignment.time_exceeded || 0,

      exceeded_minutes:
        currentAssignment.exceeded_minutes || 0,
    };
  };

  // ============================================================
  // FETCH TASKS
  // ============================================================

  const fetchTasks = useCallback(async () => {
    if (!user?.id) {
      setTasks([]);
      setLoadingTasks(false);
      return;
    }

    try {
      const res = await API.get(
        `/task/my-tasks/${user.id}`
      );

      const taskList = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.tasks)
        ? res.data.tasks
        : [];

      const normalizedTasks = taskList.map((task) =>
        normalizeTaskFromApi(task)
      );

      setTasks(normalizedTasks);
    } catch (err) {
      console.error("❌ Task fetch error:", err);

      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }, [user?.id]);

  // ============================================================
  // INITIAL FETCH + AUTO REFRESH
  // ============================================================

  useEffect(() => {
    if (!user?.id) {
      setLoadingTasks(false);
      return undefined;
    }

    fetchTasks();

    const interval = setInterval(fetchTasks, 5000);

    return () => clearInterval(interval);
  }, [user?.id, fetchTasks]);

  // ============================================================
  // LIVE CLOCK FOR RUNNING CYCLE + OVERDUE TIME
  // ============================================================

  useEffect(() => {
    const interval = setInterval(() => {
      setClockTick((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // ============================================================
  // SOCKET REAL-TIME REFRESH
  // ============================================================

  useEffect(() => {
    if (!user?.id) return undefined;

    const refreshTasks = () => {
      fetchTasks();
    };

    socket.emit("joinUser", user.id);

    socket.on("taskAssigned", refreshTasks);
    socket.on("taskUpdate", refreshTasks);
    socket.on("taskReassigned", refreshTasks);
    socket.on("taskRejected", refreshTasks);
    socket.on("taskCompleted", refreshTasks);
    socket.on("updateData", refreshTasks);

    return () => {
      socket.off("taskAssigned", refreshTasks);
      socket.off("taskUpdate", refreshTasks);
      socket.off("taskReassigned", refreshTasks);
      socket.off("taskRejected", refreshTasks);
      socket.off("taskCompleted", refreshTasks);
      socket.off("updateData", refreshTasks);
    };
  }, [user?.id, fetchTasks]);

  // ============================================================
  // STREAM HELPERS
  // ============================================================

  const stopStream = (streamRef) => {
    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => track.stop());

      streamRef.current = null;
    }
  };

  const clearTimer = (timerRef) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopAllStreams = () => {
    stopStream(voiceStreamRef);
    stopStream(photoStreamRef);
    stopStream(videoStreamRef);

    clearTimer(voiceTimerRef);
    clearTimer(videoTimerRef);
  };

  // ============================================================
  // CLEANUP ON UNMOUNT
  // ============================================================

  useEffect(() => {
    return () => {
      stopAllStreams();
    };
  }, []);

  // ============================================================
  // ACCEPT TASK
  // ============================================================

  const acceptTask = async (task) => {
    if (!task?.id || !user?.id) return;

    try {
      setAcceptingId(task.id);

      const response = await API.put(
        `/task/update-status/${task.id}`,
        {
          status: "In Progress",
          user_id: user.id,
          assignment_cycle:
            getCurrentCycleNumber(task),
        }
      );

      const updatedTask =
        response?.data?.task || null;

      if (updatedTask) {
        setTasks((prev) =>
          prev.map((currentTask) =>
            Number(currentTask.id) ===
            Number(task.id)
              ? normalizeTaskFromApi(updatedTask)
              : currentTask
          )
        );
      } else {
        setTasks((prev) =>
          prev.map((currentTask) =>
            Number(currentTask.id) ===
            Number(task.id)
              ? {
                  ...currentTask,
                  status: "In Progress",
                  accepted_at:
                    new Date().toISOString(),
                  completed_at: null,
                  rejected_at: null,
                  rejection_reason: null,
                }
              : currentTask
          )
        );
      }

      await fetchTasks();
    } catch (err) {
      console.error(
        "❌ Accept task error:",
        err
      );

      alert(
        err?.response?.data?.msg ||
          err?.response?.data?.message ||
          "❌ Failed to accept task."
      );
    } finally {
      setAcceptingId(null);
    }
  };

  // ============================================================
  // REJECT TASK
  // ============================================================

  const openRejectBox = (taskId) => {
    setRejectingId(taskId);
    setRejectReason("");
  };

  const closeRejectBox = () => {
    if (rejectLoading) return;

    setRejectingId(null);
    setRejectReason("");
  };

  const submitReject = async (task) => {
    const cleanReason = rejectReason.trim();

    if (!task?.id) {
      alert("Task not found.");
      return;
    }

    if (!user?.id) {
      alert("Logged-in user not found.");
      return;
    }

    if (!cleanReason) {
      alert("Please enter rejection reason.");
      return;
    }

    try {
      setRejectLoading(true);

      const response = await API.put(
        `/task/update-status/${task.id}`,
        {
          status: "Rejected",
          rejection_reason: cleanReason,
          user_id: user.id,
          assignment_cycle:
            getCurrentCycleNumber(task),
        }
      );

      const updatedTask =
        response?.data?.task || null;

      if (updatedTask) {
        setTasks((prev) =>
          prev.map((currentTask) =>
            Number(currentTask.id) ===
            Number(task.id)
              ? normalizeTaskFromApi(updatedTask)
              : currentTask
          )
        );
      } else {
        setTasks((prev) =>
          prev.map((currentTask) =>
            Number(currentTask.id) ===
            Number(task.id)
              ? {
                  ...currentTask,
                  status: "Rejected",
                  rejection_reason: cleanReason,
                  rejected_at:
                    new Date().toISOString(),
                  completed_at: null,
                }
              : currentTask
          )
        );
      }

      setRejectingId(null);
      setRejectReason("");

      await fetchTasks();
    } catch (err) {
      console.error(
        "❌ Reject task error:",
        err
      );

      alert(
        err?.response?.data?.msg ||
          err?.response?.data?.message ||
          "❌ Failed to reject task."
      );
    } finally {
      setRejectLoading(false);
    }
  };

  // ============================================================
  // COMPLETION MODAL
  // ============================================================

  const openCompletionModal = (task) => {
    resetCompletionForm(false);
    setCompletionTask(task);
  };

  const closeCompletionModal = () => {
    if (submittingCompletion) return;
    resetCompletionForm(true);
  };

  const resetCompletionForm = (
    closeModal = true
  ) => {
    stopAllStreams();

    voiceNotes.forEach((voice) => {
      if (voice.url) {
        URL.revokeObjectURL(voice.url);
      }
    });

    setCompletionNote("");
    setCompletionFiles([]);
    setVoiceNotes([]);

    setIsRecordingVoice(false);
    setVoiceRecordingSeconds(0);
    voiceRecordingSecondsRef.current = 0;

    setShowPhotoCamera(false);
    setPhotoCameraReady(false);

    setShowVideoCamera(false);
    setIsRecordingVideo(false);
    setVideoRecordingSeconds(0);

    voiceChunksRef.current = [];
    videoChunksRef.current = [];

    voiceRecorderRef.current = null;
    videoRecorderRef.current = null;

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (closeModal) {
      setCompletionTask(null);
    }
  };

  // ============================================================
  // ADD COMPLETION FILES
  // ============================================================

  const addCompletionFiles = (newFiles) => {
    const files = Array.from(newFiles || []);

    if (!files.length) return;

    const validFiles = files.filter((file) => {
      if (file.size > 100 * 1024 * 1024) {
        alert(
          `${file.name} exceeds the 100 MB limit.`
        );

        return false;
      }

      return true;
    });

    setCompletionFiles((prev) => {
      const combined = [...prev, ...validFiles];

      const unique = combined.filter(
        (file, index, array) =>
          index ===
          array.findIndex(
            (item) =>
              item.name === file.name &&
              item.size === file.size &&
              item.lastModified ===
                file.lastModified
          )
      );

      if (unique.length > 30) {
        alert(
          "Maximum 30 completion files are allowed."
        );

        return unique.slice(0, 30);
      }

      return unique;
    });
  };

  const handleCompletionFiles = (event) => {
    addCompletionFiles(event.target.files);
    event.target.value = "";
  };

  const removeCompletionFile = (
    indexToRemove
  ) => {
    setCompletionFiles((prev) =>
      prev.filter(
        (_, index) => index !== indexToRemove
      )
    );
  };

  // ============================================================
  // FILE HELPERS
  // ============================================================

  const getFileType = (file) => {
    const type = String(
      file?.type || ""
    ).toLowerCase();

    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/")) return "audio";

    return "file";
  };

  const getFileIcon = (file) => {
    const fileType = getFileType(file);

    if (fileType === "image") {
      return (
        <ImageIcon
          size={20}
          className="text-blue-400"
        />
      );
    }

    if (fileType === "video") {
      return (
        <Video
          size={20}
          className="text-purple-400"
        />
      );
    }

    return (
      <FileText
        size={20}
        className="text-yellow-500"
      />
    );
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";

    const units = ["B", "KB", "MB", "GB"];

    const index = Math.floor(
      Math.log(bytes) / Math.log(1024)
    );

    const safeIndex = Math.min(
      Math.max(index, 0),
      units.length - 1
    );

    return `${(
      bytes /
      1024 ** safeIndex
    ).toFixed(safeIndex === 0 ? 0 : 1)} ${
      units[safeIndex]
    }`;
  };

  const formatRecordingTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);

    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(
      2,
      "0"
    )}:${String(remainingSeconds).padStart(
      2,
      "0"
    )}`;
  };

  // ============================================================
  // PHOTO CAMERA
  // ============================================================

  const openPhotoCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert(
        "Camera is not supported in this browser."
      );
      return;
    }

    try {
      stopStream(photoStreamRef);

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },
          },
          audio: false,
        });

      photoStreamRef.current = stream;

      setShowPhotoCamera(true);
      setPhotoCameraReady(false);

      setTimeout(() => {
        if (photoVideoRef.current) {
          photoVideoRef.current.srcObject =
            stream;

          photoVideoRef.current
            .play()
            .then(() =>
              setPhotoCameraReady(true)
            )
            .catch(console.error);
        }
      }, 100);
    } catch (err) {
      console.error("❌ Camera error:", err);

      alert(
        "Camera access failed. Please allow camera permission and try again."
      );
    }
  };

  const closePhotoCamera = () => {
    stopStream(photoStreamRef);
    setShowPhotoCamera(false);
    setPhotoCameraReady(false);
  };

  const capturePhoto = () => {
    const video = photoVideoRef.current;
    const canvas = photoCanvasRef.current;

    if (
      !video ||
      !canvas ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      alert("Camera is not ready yet.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          alert("Failed to capture photo.");
          return;
        }

        const file = new File(
          [blob],
          `task-photo-${
            completionTask?.id || "work"
          }-${Date.now()}.jpg`,
          {
            type: "image/jpeg",
          }
        );

        addCompletionFiles([file]);
      },
      "image/jpeg",
      0.92
    );
  };

  // ============================================================
  // VIDEO CAMERA
  // ============================================================

  const openVideoCamera = async () => {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      alert(
        "Video recording is not supported in this browser."
      );
      return;
    }

    try {
      stopStream(videoStreamRef);

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },
          },
          audio: true,
        });

      videoStreamRef.current = stream;

      setShowVideoCamera(true);
      setIsRecordingVideo(false);
      setVideoRecordingSeconds(0);

      setTimeout(() => {
        if (recordedVideoRef.current) {
          recordedVideoRef.current.srcObject =
            stream;

          recordedVideoRef.current
            .play()
            .catch(console.error);
        }
      }, 100);
    } catch (err) {
      console.error(
        "❌ Video camera error:",
        err
      );

      alert(
        "Camera or microphone access failed. Please allow permissions and try again."
      );
    }
  };

  const startVideoRecording = () => {
    const stream = videoStreamRef.current;

    if (!stream) {
      alert("Camera stream not found.");
      return;
    }

    videoChunksRef.current = [];

    let recorder;

    try {
      if (
        MediaRecorder.isTypeSupported(
          "video/webm;codecs=vp9,opus"
        )
      ) {
        recorder = new MediaRecorder(stream, {
          mimeType:
            "video/webm;codecs=vp9,opus",
        });
      } else if (
        MediaRecorder.isTypeSupported(
          "video/webm;codecs=vp8,opus"
        )
      ) {
        recorder = new MediaRecorder(stream, {
          mimeType:
            "video/webm;codecs=vp8,opus",
        });
      } else if (
        MediaRecorder.isTypeSupported(
          "video/webm"
        )
      ) {
        recorder = new MediaRecorder(stream, {
          mimeType: "video/webm",
        });
      } else {
        recorder = new MediaRecorder(stream);
      }
    } catch (err) {
      console.error(
        "❌ Video recorder error:",
        err
      );

      alert(
        "Unable to start video recording."
      );
      return;
    }

    videoRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data?.size > 0) {
        videoChunksRef.current.push(
          event.data
        );
      }
    };

    recorder.onstop = () => {
      const mimeType =
        recorder.mimeType || "video/webm";

      const blob = new Blob(
        videoChunksRef.current,
        {
          type: mimeType,
        }
      );

      if (blob.size > 0) {
        const extension =
          mimeType.includes("mp4")
            ? "mp4"
            : "webm";

        const file = new File(
          [blob],
          `task-video-${
            completionTask?.id || "work"
          }-${Date.now()}.${extension}`,
          {
            type: mimeType,
          }
        );

        addCompletionFiles([file]);
      }

      videoChunksRef.current = [];
    };

    recorder.start(1000);

    setIsRecordingVideo(true);
    setVideoRecordingSeconds(0);

    clearTimer(videoTimerRef);

    videoTimerRef.current = setInterval(
      () => {
        setVideoRecordingSeconds(
          (prev) => prev + 1
        );
      },
      1000
    );
  };

  const stopVideoRecording = () => {
    if (
      videoRecorderRef.current &&
      videoRecorderRef.current.state !==
        "inactive"
    ) {
      videoRecorderRef.current.stop();
    }

    clearTimer(videoTimerRef);

    setIsRecordingVideo(false);
  };

  const closeVideoCamera = () => {
    if (isRecordingVideo) {
      stopVideoRecording();
    }

    stopStream(videoStreamRef);

    setShowVideoCamera(false);
    setIsRecordingVideo(false);
    setVideoRecordingSeconds(0);
  };

  // ============================================================
  // MULTIPLE VOICE RECORDING
  // ============================================================

  const startVoiceRecording = async () => {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      alert(
        "Voice recording is not supported in this browser."
      );
      return;
    }

    if (voiceNotes.length >= 10) {
      alert(
        "Maximum 10 voice notes are allowed."
      );
      return;
    }

    try {
      stopStream(voiceStreamRef);

      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];

      let recorder;

      if (
        MediaRecorder.isTypeSupported(
          "audio/webm;codecs=opus"
        )
      ) {
        recorder = new MediaRecorder(stream, {
          mimeType:
            "audio/webm;codecs=opus",
        });
      } else if (
        MediaRecorder.isTypeSupported(
          "audio/webm"
        )
      ) {
        recorder = new MediaRecorder(stream, {
          mimeType: "audio/webm",
        });
      } else {
        recorder = new MediaRecorder(stream);
      }

      voiceRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          voiceChunksRef.current.push(
            event.data
          );
        }
      };

      recorder.onstop = () => {
        const mimeType =
          recorder.mimeType || "audio/webm";

        const blob = new Blob(
          voiceChunksRef.current,
          {
            type: mimeType,
          }
        );

        if (blob.size > 0) {
          const url =
            URL.createObjectURL(blob);

          setVoiceNotes((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random()}`,
              blob,
              url,
              duration:
                voiceRecordingSecondsRef.current,
              mimeType,
            },
          ]);
        }

        stopStream(voiceStreamRef);
        voiceChunksRef.current = [];
      };

      recorder.start(500);

      voiceRecordingSecondsRef.current = 0;

      setIsRecordingVoice(true);
      setVoiceRecordingSeconds(0);

      clearTimer(voiceTimerRef);

      voiceTimerRef.current = setInterval(
        () => {
          voiceRecordingSecondsRef.current += 1;

          setVoiceRecordingSeconds(
            voiceRecordingSecondsRef.current
          );
        },
        1000
      );
    } catch (err) {
      console.error(
        "❌ Microphone error:",
        err
      );

      alert(
        "Microphone access failed. Please allow microphone permission and try again."
      );
    }
  };

  const stopVoiceRecording = () => {
    if (
      voiceRecorderRef.current &&
      voiceRecorderRef.current.state !==
        "inactive"
    ) {
      voiceRecorderRef.current.stop();
    }

    clearTimer(voiceTimerRef);
    setIsRecordingVoice(false);
  };

  const removeVoiceRecording = (id) => {
    setVoiceNotes((prev) => {
      const target = prev.find(
        (voice) => voice.id === id
      );

      if (target?.url) {
        URL.revokeObjectURL(target.url);
      }

      return prev.filter(
        (voice) => voice.id !== id
      );
    });
  };

  // ============================================================
  // SUBMIT COMPLETION WORK
  // ============================================================

  const submitCompletionWork = async () => {
    if (!completionTask?.id) {
      alert("Task not found.");
      return;
    }

    if (!user?.id) {
      alert("Logged-in user not found.");
      return;
    }

    if (
      isRecordingVoice ||
      isRecordingVideo
    ) {
      alert(
        "Please stop all active recordings before submitting."
      );
      return;
    }

    const cleanNote =
      completionNote.trim();

    if (
      !cleanNote &&
      completionFiles.length === 0 &&
      voiceNotes.length === 0
    ) {
      alert(
        "Please add at least one completion note, media file, document, captured photo, recorded video, or voice note."
      );
      return;
    }

    try {
      setSubmittingCompletion(true);

      const formData = new FormData();

      formData.append(
        "user_id",
        String(user.id)
      );

      formData.append(
        "completion_note",
        cleanNote
      );

      const currentCycle =
        getCurrentCycleNumber(completionTask);

      formData.append(
        "assignment_cycle",
        String(currentCycle)
      );

      const deadline =
        getTaskDeadline(completionTask);

      if (deadline) {
        formData.append(
          "deadline",
          deadline.toISOString()
        );
      }

      completionFiles.forEach((file) => {
        formData.append(
          "files",
          file,
          file.name
        );
      });

      voiceNotes.forEach(
        (voice, index) => {
          let extension = "webm";

          if (
            voice.mimeType.includes("ogg")
          ) {
            extension = "ogg";
          } else if (
            voice.mimeType.includes("mp4")
          ) {
            extension = "m4a";
          }

          const voiceFile = new File(
            [voice.blob],
            `voice-note-task-${
              completionTask.id
            }-cycle-${currentCycle}-${
              index + 1
            }-${Date.now()}.${extension}`,
            {
              type:
                voice.mimeType ||
                "audio/webm",
            }
          );

          formData.append(
            "voice_notes",
            voiceFile,
            voiceFile.name
          );
        }
      );

      const response = await API.post(
        `/task/complete-work/${completionTask.id}`,
        formData
      );

      alert(
        response?.data?.msg ||
          response?.data?.message ||
          "✅ Work completed and submitted successfully!"
      );

      resetCompletionForm(true);

      await fetchTasks();
    } catch (err) {
      console.error(
        "❌ Complete work error:",
        err
      );

      alert(
        err?.response?.data?.msg ||
          err?.response?.data?.message ||
          "❌ Failed to submit completion work. Please try again."
      );
    } finally {
      setSubmittingCompletion(false);
    }
  };

  // ============================================================
  // UI STATUS HELPERS
  // ============================================================

  const getStatusIcon = (task) => {
    if (isCompletedTask(task)) {
      return <CheckCircle size={30} />;
    }

    if (isRejectedTask(task)) {
      return <Ban size={30} />;
    }

    if (isInProgressTask(task)) {
      return <PlayCircle size={30} />;
    }

    return <Clock size={30} />;
  };

  const getStatusIconClasses = (task) => {
    if (isCompletedTask(task)) {
      return "bg-green-500/10 text-green-500";
    }

    if (isRejectedTask(task)) {
      return "bg-red-500/10 text-red-500";
    }

    if (isInProgressTask(task)) {
      return "bg-blue-500/10 text-blue-400";
    }

    return "bg-yellow-500/10 text-yellow-500";
  };

  const getPriorityClasses = (priority) => {
    const value = String(
      priority || ""
    ).toLowerCase();

    if (value === "high") {
      return "bg-red-500/20 text-red-400 border border-red-500/20";
    }

    if (value === "medium") {
      return "bg-orange-500/20 text-orange-400 border border-orange-500/20";
    }

    return "bg-blue-500/20 text-blue-400 border border-blue-500/20";
  };

  const getTaskCardClasses = (task) => {
    const performance =
      getTimePerformance(task);

    if (performance.isOverdue) {
      return "border-red-500/50 shadow-red-500/10";
    }

    if (performance.completedLate) {
      return "border-orange-500/40 shadow-orange-500/10";
    }

    if (isRepeatedTask(task)) {
      return "border-purple-500/30 shadow-purple-500/5";
    }

    return "border-white/10";
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-700">
      <h1 className="text-3xl font-black text-white mb-8 italic tracking-tight">
        MY{" "}
        <span className="text-yellow-500 not-italic">
          ASSIGNED TASKS
        </span>
      </h1>

      <div className="grid gap-6">
        {loadingTasks ? (
          <div className="text-center py-20 bg-slate-900/20 rounded-[3rem] border border-dashed border-white/10">
            <Loader2
              className="mx-auto text-yellow-500 mb-4 animate-spin"
              size={50}
            />

            <p className="text-slate-500 font-black uppercase tracking-widest">
              Loading Tasks...
            </p>
          </div>
        ) : tasks.length > 0 ? (
          tasks.map((task) => {
            const assignmentCycles =
              getAssignmentCycles(task);

            const assignmentCount =
              getAssignmentCount(task);

            const currentCycleNumber =
              getCurrentCycleNumber(task);

            const totalCombinedWorkTimeMs =
              getTotalCombinedWorkTimeMs(task);

            const performance =
              getTimePerformance(task);

            const currentStatus =
              getCurrentStatus(task);

            const currentRejectionReason =
              getCurrentRejectionReason(task);

            return (
              <div
                key={`${task.id}-${assignmentCount}-${currentStatus}`}
                className={`relative overflow-hidden bg-slate-900/40 border backdrop-blur-xl p-6 md:p-8 rounded-[2.5rem] flex flex-col md:flex-row justify-between items-start md:items-center gap-6 transition-all hover:border-yellow-500/30 shadow-2xl ${getTaskCardClasses(
                  task
                )}`}
              >
                {performance.isOverdue && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-red-500 animate-pulse" />
                )}

                <div className="flex items-start gap-4 md:gap-6 min-w-0">
                  <div
                    className={`p-4 rounded-2xl shrink-0 ${getStatusIconClasses(
                      task
                    )}`}
                  >
                    {getStatusIcon(task)}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="text-xl font-black text-white tracking-tight break-words">
                        {task.title}
                      </h3>

                      {isRepeatedTask(task) && (
                        <span className="inline-flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/30 text-purple-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
                          <RotateCcw size={12} />
                          Assigned {assignmentCount} Times
                        </span>
                      )}

                      {performance.isOverdue && (
                        <span className="inline-flex items-center gap-1.5 bg-red-500/20 border border-red-500/40 text-red-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse">
                          <Timer size={12} />
                          Time Exceeded
                        </span>
                      )}

                      {performance.completedLate && (
                        <span className="inline-flex items-center gap-1.5 bg-orange-500/20 border border-orange-500/40 text-orange-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
                          <Timer size={12} />
                          Completed Late
                        </span>
                      )}
                    </div>

                    <p className="text-slate-400 text-sm mt-1 max-w-xl break-words">
                      {task.description}
                    </p>

                    {task.panel && (
                      <div className="mt-3 inline-flex flex-wrap items-center gap-2 bg-white/[0.04] border border-white/5 px-3 py-2 rounded-xl">
                        <span className="text-[9px] font-black uppercase tracking-widest text-yellow-500">
                          Panel:
                        </span>

                        <span className="text-[10px] font-bold text-white">
                          {task.panel.panel_code ||
                            "N/A"}
                        </span>

                        <span className="text-slate-600">
                          •
                        </span>

                        <span className="text-[10px] text-slate-300">
                          {task.panel.panel_name ||
                            "Unnamed Panel"}
                        </span>
                      </div>
                    )}

                    <div className="text-[10px] text-slate-500 mt-4 space-y-1.5">
                      <div>
                        📅 Current Assigned:{" "}
                        {formatDateTime(
                          getCurrentAssignedAt(task)
                        )}
                      </div>

                      <div
                        className={`font-bold ${
                          isRepeatedTask(task)
                            ? "text-purple-400"
                            : "text-slate-500"
                        } flex items-center gap-1.5`}
                      >
                        <History size={12} />
                        Current Assignment Cycle #
                        {currentCycleNumber}
                      </div>

                      <div className="text-purple-400 font-black flex items-center gap-1.5">
                        <RotateCcw size={12} />
                        Total Assignment Cycles:{" "}
                        {assignmentCount}
                      </div>

                      {/* COMPLETE OLD + NEW CYCLE HISTORY */}

                      {assignmentCycles.length > 0 && (
                        <div className="mt-3 space-y-2 bg-white/[0.025] border border-white/5 rounded-xl p-3">
                          <div className="text-[9px] uppercase tracking-widest text-slate-400 font-black flex items-center gap-1.5">
                            <History size={12} />
                            Complete Cycle Work History
                          </div>

                          {assignmentCycles.map(
                            (cycle) => {
                              const cycleNumber =
                                Number(
                                  cycle.assignment_cycle
                                ) || 1;

                              const cycleWorkTimeMs =
                                getCycleWorkTimeMs(
                                  cycle
                                );

                              return (
                                <div
                                  key={`${task.id}-cycle-${cycleNumber}`}
                                  className="flex flex-wrap items-center gap-2 text-cyan-400"
                                >
                                  <Timer size={12} />

                                  <span className="font-bold">
                                    Cycle #{cycleNumber}
                                    :
                                  </span>

                                  <span className="text-white font-black">
                                    {formatFullDurationFromMs(
                                      cycleWorkTimeMs
                                    )}
                                  </span>

                                  <span className="text-slate-600">
                                    •
                                  </span>

                                  <span className="capitalize text-slate-400">
                                    {cycle.status ||
                                      "Unknown"}
                                  </span>
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}

                      {/* TOTAL OLD + NEW COMBINED TIME */}

                      <div className="mt-3 inline-flex flex-wrap items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-3 py-2 rounded-xl font-black">
                        <Clock size={13} />

                        Total Combined Work Time:

                        <span className="text-white">
                          {formatFullDurationFromMs(
                            totalCombinedWorkTimeMs
                          )}
                        </span>
                      </div>

                      {getCurrentAcceptedAt(task) && (
                        <div className="text-blue-400">
                          ▶ Accepted:{" "}
                          {formatDateTime(
                            getCurrentAcceptedAt(task)
                          )}
                        </div>
                      )}

                      {getCurrentRejectedAt(task) &&
                        isRejectedTask(task) && (
                          <div className="text-red-400">
                            ❌ Rejected:{" "}
                            {formatDateTime(
                              getCurrentRejectedAt(task)
                            )}
                          </div>
                        )}

                      {getCurrentCompletedAt(task) &&
                        isCompletedTask(task) && (
                          <div className="text-green-400">
                            ✅ Completed:{" "}
                            {formatDateTime(
                              getCurrentCompletedAt(task)
                            )}
                          </div>
                        )}

                      {performance.hasDeadline && (
                        <div
                          className={`flex items-center gap-1.5 font-bold ${
                            performance.isOverdue
                              ? "text-red-400"
                              : performance.completedLate
                              ? "text-orange-400"
                              : "text-cyan-400"
                          }`}
                        >
                          <CalendarClock size={12} />
                          Deadline:{" "}
                          {formatDateTime(
                            performance.deadline
                          )}
                        </div>
                      )}

                      {performance.isOverdue && (
                        <div className="text-red-400 font-black bg-red-500/10 border border-red-500/20 inline-flex items-center gap-2 px-3 py-2 rounded-lg mt-2">
                          <AlertCircle size={13} />
                          Overdue by{" "}
                          {formatDurationFromMs(
                            performance.exceededMs
                          )}
                        </div>
                      )}

                      {performance.completedLate && (
                        <div className="text-orange-400 font-black bg-orange-500/10 border border-orange-500/20 inline-flex items-center gap-2 px-3 py-2 rounded-lg mt-2">
                          <Timer size={13} />
                          Completed{" "}
                          {formatDurationFromMs(
                            performance.exceededMs
                          )}{" "}
                          late
                        </div>
                      )}

                      {task.duration && (
                        <div className="text-yellow-400 font-bold">
                          ⏱ Work Duration:{" "}
                          {task.duration}
                        </div>
                      )}

                      {isRejectedTask(task) &&
                        currentRejectionReason && (
                          <div className="text-red-400 mt-3 max-w-xl bg-red-500/5 border border-red-500/10 p-3 rounded-xl">
                            <span className="font-black">
                              ❌ Rejection Reason:
                            </span>{" "}
                            {currentRejectionReason}
                          </div>
                        )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 w-full md:w-auto">
                  <span
                    className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${getPriorityClasses(
                      task.priority
                    )}`}
                  >
                    {task.priority || "Low"} Priority
                  </span>

                  {isPendingTask(task) && (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            acceptTask(task)
                          }
                          disabled={
                            acceptingId === task.id ||
                            rejectLoading
                          }
                          className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black px-5 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 flex items-center gap-2"
                        >
                          {acceptingId === task.id ? (
                            <>
                              <Loader2
                                size={14}
                                className="animate-spin"
                              />
                              Accepting...
                            </>
                          ) : (
                            <>
                              <CheckCircle size={14} />
                              Accept
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            openRejectBox(task.id)
                          }
                          disabled={
                            acceptingId === task.id
                          }
                          className="bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95"
                        >
                          Reject
                        </button>
                      </div>

                      {rejectingId === task.id && (
                        <div className="mt-2 bg-slate-950/90 border border-red-500/20 p-3 rounded-2xl min-w-[280px]">
                          <div className="flex items-center gap-2 mb-3">
                            <AlertCircle
                              size={16}
                              className="text-red-400"
                            />

                            <p className="text-red-400 text-xs font-black uppercase tracking-widest">
                              Reject Task
                            </p>
                          </div>

                          <textarea
                            placeholder="Enter rejection reason..."
                            value={rejectReason}
                            onChange={(e) =>
                              setRejectReason(
                                e.target.value
                              )
                            }
                            rows={4}
                            maxLength={2000}
                            className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-xl text-xs outline-none focus:border-red-500 resize-none"
                          />

                          <p className="text-right text-[9px] text-slate-600 mt-1">
                            {rejectReason.length} /
                            2000
                          </p>

                          <div className="flex gap-2 mt-3">
                            <button
                              type="button"
                              onClick={() =>
                                submitReject(task)
                              }
                              disabled={
                                rejectLoading ||
                                !rejectReason.trim()
                              }
                              className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2"
                            >
                              {rejectLoading ? (
                                <>
                                  <Loader2
                                    size={14}
                                    className="animate-spin"
                                  />
                                  Submitting...
                                </>
                              ) : (
                                <>
                                  <Ban size={14} />
                                  Submit Rejection
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={
                                closeRejectBox
                              }
                              disabled={rejectLoading}
                              className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {isInProgressTask(task) && (
                    <button
                      type="button"
                      onClick={() =>
                        openCompletionModal(task)
                      }
                      className="bg-green-500 hover:bg-green-400 text-slate-950 px-6 py-3 rounded-xl text-xs font-black transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-green-500/10"
                    >
                      <CheckCircle size={17} />
                      Complete Work
                    </button>
                  )}

                  {isCompletedTask(task) && (
                    <span className="px-5 py-2.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl text-[10px] font-black uppercase tracking-widest">
                      Work Completed
                    </span>
                  )}

                  {isRejectedTask(task) && (
                    <span className="px-5 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest">
                      Task Rejected
                    </span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-20 bg-slate-900/20 rounded-[3rem] border border-dashed border-white/10">
            <AlertCircle
              className="mx-auto text-slate-700 mb-4"
              size={56}
            />

            <p className="text-slate-500 font-black uppercase tracking-widest italic">
              No tasks assigned to you at the moment.
            </p>
          </div>
        )}
      </div>

      {/* ======================================================
          COMPLETION MODAL
      ====================================================== */}

      {completionTask && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeCompletionModal();
            }
          }}
        >
          <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-slate-950 border border-white/10 rounded-[2rem] md:rounded-[3rem] shadow-2xl relative">
            <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-xl border-b border-white/10 px-6 md:px-10 py-6 flex items-center justify-between">
              <div>
                <p className="text-[9px] text-yellow-500 font-black uppercase tracking-[0.3em] mb-2">
                  Task #{completionTask.id} •
                  Assignment Cycle #
                  {getCurrentCycleNumber(
                    completionTask
                  )}
                </p>

                <h2 className="text-xl md:text-2xl font-black text-white uppercase italic">
                  Complete{" "}
                  <span className="text-yellow-500 not-italic">
                    Work Submission
                  </span>
                </h2>
              </div>

              <button
                type="button"
                onClick={closeCompletionModal}
                disabled={submittingCompletion}
                className="w-11 h-11 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition-all disabled:opacity-50"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-6 md:p-10 space-y-8">
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-5">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <p className="text-[9px] uppercase tracking-widest text-yellow-500 font-black">
                    Current Task
                  </p>

                  {isRepeatedTask(
                    completionTask
                  ) && (
                    <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-1 rounded-lg text-[8px] font-black uppercase">
                      Repeat #
                      {getCurrentCycleNumber(
                        completionTask
                      )}
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-black text-white">
                  {completionTask.title}
                </h3>

                {completionTask.description && (
                  <p className="text-sm text-slate-400 mt-2">
                    {
                      completionTask.description
                    }
                  </p>
                )}

                <div className="mt-4 inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-3 py-2 rounded-xl text-xs font-black">
                  <Clock size={14} />
                  Total Combined Work Time:
                  <span className="text-white">
                    {formatFullDurationFromMs(
                      getTotalCombinedWorkTimeMs(
                        completionTask
                      )
                    )}
                  </span>
                </div>

                {getTimePerformance(
                  completionTask
                ).isOverdue && (
                  <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3 text-xs font-black flex items-center gap-2">
                    <AlertCircle size={16} />
                    This task has exceeded its
                    allowed completion time by{" "}
                    {formatDurationFromMs(
                      getTimePerformance(
                        completionTask
                      ).exceededMs
                    )}
                    .
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 mb-3">
                  <FileText
                    size={16}
                    className="text-yellow-500"
                  />
                  Work Completion Notes
                </label>

                <textarea
                  value={completionNote}
                  onChange={(e) =>
                    setCompletionNote(
                      e.target.value
                    )
                  }
                  rows={6}
                  maxLength={10000}
                  placeholder="Describe the work completed, repairs performed, observations, testing results, or any other important details..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-5 text-white text-sm outline-none resize-y focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/10 transition-all"
                />

                <p className="text-right text-[9px] text-slate-600 mt-2">
                  {completionNote.length} / 10000
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 mb-3">
                  <Paperclip
                    size={16}
                    className="text-yellow-500"
                  />
                  Work Evidence & Attachments
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,.pdf,.txt,.doc,.docx,.xls,.xlsx"
                  onChange={
                    handleCompletionFiles
                  }
                  className="hidden"
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      fileInputRef.current?.click()
                    }
                    className="border-2 border-dashed border-slate-700 hover:border-yellow-500/50 bg-slate-900/50 hover:bg-yellow-500/5 rounded-2xl p-6 transition-all"
                  >
                    <Upload
                      size={30}
                      className="mx-auto text-yellow-500 mb-3"
                    />

                    <p className="text-white font-black text-xs">
                      Upload Files
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={openPhotoCamera}
                    className="border-2 border-dashed border-slate-700 hover:border-blue-500/50 bg-slate-900/50 hover:bg-blue-500/5 rounded-2xl p-6 transition-all"
                  >
                    <Camera
                      size={30}
                      className="mx-auto text-blue-400 mb-3"
                    />

                    <p className="text-white font-black text-xs">
                      Capture Photo
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={openVideoCamera}
                    className="border-2 border-dashed border-slate-700 hover:border-purple-500/50 bg-slate-900/50 hover:bg-purple-500/5 rounded-2xl p-6 transition-all"
                  >
                    <VideoIcon
                      size={30}
                      className="mx-auto text-purple-400 mb-3"
                    />

                    <p className="text-white font-black text-xs">
                      Record Video
                    </p>
                  </button>
                </div>

                {completionFiles.length > 0 && (
                  <div className="mt-5 grid gap-3">
                    {completionFiles.map(
                      (file, index) => (
                        <div
                          key={`${file.name}-${file.size}-${index}`}
                          className="bg-slate-900 border border-white/5 rounded-xl p-4 flex items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                              {getFileIcon(file)}
                            </div>

                            <div className="min-w-0">
                              <p className="text-white text-xs font-bold truncate">
                                {file.name}
                              </p>

                              <p className="text-slate-600 text-[9px] mt-1">
                                {formatFileSize(
                                  file.size
                                )}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              removeCompletionFile(
                                index
                              )
                            }
                            className="w-9 h-9 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white flex items-center justify-center transition-all shrink-0"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 mb-3">
                  <Mic
                    size={16}
                    className="text-yellow-500"
                  />
                  Multiple Voice Notes
                </label>

                <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
                  {!isRecordingVoice && (
                    <button
                      type="button"
                      onClick={
                        startVoiceRecording
                      }
                      disabled={
                        voiceNotes.length >= 10
                      }
                      className="w-full bg-red-500/10 hover:bg-red-500 disabled:opacity-40 border border-red-500/20 text-red-400 hover:text-white py-4 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all"
                    >
                      <Mic size={19} />

                      {voiceNotes.length > 0
                        ? "Record Another Voice Note"
                        : "Start Voice Recording"}
                    </button>
                  )}

                  {isRecordingVoice && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="w-4 h-4 rounded-full bg-red-500 animate-ping absolute inset-0" />

                          <div className="w-4 h-4 rounded-full bg-red-500 relative" />
                        </div>

                        <div>
                          <p className="text-red-400 font-black text-xs uppercase tracking-widest">
                            Recording Voice
                          </p>

                          <p className="text-white text-xl font-black mt-1">
                            {formatRecordingTime(
                              voiceRecordingSeconds
                            )}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={
                          stopVoiceRecording
                        }
                        className="bg-red-500 hover:bg-red-400 text-white px-6 py-3 rounded-xl text-xs font-black flex items-center gap-2"
                      >
                        <Square
                          size={16}
                          fill="currentColor"
                        />
                        Stop Recording
                      </button>
                    </div>
                  )}

                  {voiceNotes.length > 0 && (
                    <div className="mt-5 space-y-3">
                      {voiceNotes.map(
                        (voice, index) => (
                          <div
                            key={voice.id}
                            className="bg-slate-950/70 border border-white/5 rounded-xl p-4"
                          >
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <div className="flex items-center gap-3">
                                <PlayCircle
                                  size={22}
                                  className="text-green-400"
                                />

                                <div>
                                  <p className="text-white text-xs font-black">
                                    Voice Note #
                                    {index + 1}
                                  </p>

                                  <p className="text-green-400 text-[9px] mt-1">
                                    {formatRecordingTime(
                                      voice.duration
                                    )}
                                  </p>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  removeVoiceRecording(
                                    voice.id
                                  )
                                }
                                className="w-9 h-9 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-lg flex items-center justify-center"
                              >
                                <Trash2
                                  size={16}
                                />
                              </button>
                            </div>

                            <audio
                              controls
                              src={voice.url}
                              className="w-full"
                            />
                          </div>
                        )
                      )}
                    </div>
                  )}

                  <p className="text-slate-600 text-[9px] mt-4 uppercase tracking-widest">
                    {voiceNotes.length} / 10 voice
                    notes added
                  </p>
                </div>
              </div>

              <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-5">
                <p className="text-blue-400 text-xs font-bold leading-relaxed">
                  Your completion notes, uploaded
                  files, captured photos, recorded
                  videos and multiple voice notes
                  will be permanently linked with
                  Task #{completionTask.id},
                  Assignment Cycle #
                  {getCurrentCycleNumber(
                    completionTask
                  )}, and shown in the Work
                  Completion Report.
                </p>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCompletionModal}
                  disabled={submittingCompletion}
                  className="sm:w-auto px-7 py-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={
                    submitCompletionWork
                  }
                  disabled={
                    submittingCompletion ||
                    isRecordingVoice ||
                    isRecordingVideo
                  }
                  className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 py-4 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-yellow-500/10 transition-all active:scale-[0.99]"
                >
                  {submittingCompletion ? (
                    <>
                      <Loader2
                        size={19}
                        className="animate-spin"
                      />
                      Submitting Work...
                    </>
                  ) : (
                    <>
                      <Send size={19} />
                      Complete & Submit Work
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================
          PHOTO CAMERA
      ====================================================== */}

      {showPhotoCamera && (
        <div className="fixed inset-0 z-[10000] bg-black/95 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-slate-950 border border-white/10 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-black">
                Capture Current Photo
              </h3>

              <button
                type="button"
                onClick={closePhotoCamera}
                className="w-10 h-10 bg-red-500/10 text-red-400 rounded-xl flex items-center justify-center"
              >
                <X size={20} />
              </button>
            </div>

            <video
              ref={photoVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full max-h-[65vh] bg-black rounded-2xl object-contain"
            />

            <canvas
              ref={photoCanvasRef}
              className="hidden"
            />

            <button
              type="button"
              onClick={capturePhoto}
              disabled={!photoCameraReady}
              className="w-full mt-4 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2"
            >
              <Camera size={20} />
              Capture & Add Photo
            </button>
          </div>
        </div>
      )}

      {/* ======================================================
          VIDEO CAMERA
      ====================================================== */}

      {showVideoCamera && (
        <div className="fixed inset-0 z-[10000] bg-black/95 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-slate-950 border border-white/10 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-black">
                  Record Current Video
                </h3>

                {isRecordingVideo && (
                  <p className="text-red-400 text-xs font-black mt-1">
                    Recording:{" "}
                    {formatRecordingTime(
                      videoRecordingSeconds
                    )}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={closeVideoCamera}
                className="w-10 h-10 bg-red-500/10 text-red-400 rounded-xl flex items-center justify-center"
              >
                <X size={20} />
              </button>
            </div>

            <video
              ref={recordedVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full max-h-[65vh] bg-black rounded-2xl object-contain"
            />

            {!isRecordingVideo ? (
              <button
                type="button"
                onClick={
                  startVideoRecording
                }
                className="w-full mt-4 bg-red-500 hover:bg-red-400 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2"
              >
                <VideoIcon size={20} />
                Start Video Recording
              </button>
            ) : (
              <button
                type="button"
                onClick={
                  stopVideoRecording
                }
                className="w-full mt-4 bg-red-600 hover:bg-red-500 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2"
              >
                <Square
                  size={18}
                  fill="currentColor"
                />
                Stop & Add Video
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}