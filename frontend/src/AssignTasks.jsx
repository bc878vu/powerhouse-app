import React, { useEffect, useMemo, useRef, useState } from 'react';
import API from './api';
import { isPublic } from './utils/publicMode';

import {
  AlertCircle,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
 File as FileIcon,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  UploadCloud,
  UserCheck,
  Users,
  Video,
  VideoOff,
  Volume2,
  X,
  Zap
} from 'lucide-react';

// ============================================================
// INITIAL FORM DATA
// ============================================================

const initialFormData = {
  title: '',
  description: '',
  category: 'Electrical',
  priority: 'High',
  user_id: '',
  user_ids: [],
  status: 'Pending'
};

// ============================================================
// API MEDIA BASE URL
// ============================================================

const mediaBaseUrl = (import.meta.env.VITE_API_URL || '')
  .replace(/\/api\/?$/, '')
  .replace(/\/$/, '');

// ============================================================
// CATEGORIES
// ============================================================

const categories = [
  'Electrical',
  'Mechanical',
  'CRO',
  'General',
  'Safety',
  'Maintenance',
  'Inspection',
  'Emergency'
];

// ============================================================
// PRIORITIES
// ============================================================

const priorities = [
  {
    value: 'Low',
    label: 'Low',
    description: 'Normal priority task',
    dot: 'bg-emerald-400',
    active:
      'border-emerald-500/60 bg-emerald-500/10 text-emerald-400'
  },
  {
    value: 'Medium',
    label: 'Medium',
    description: 'Moderate priority task',
    dot: 'bg-blue-400',
    active:
      'border-blue-500/60 bg-blue-500/10 text-blue-400'
  },
  {
    value: 'High',
    label: 'High',
    description: 'Important priority task',
    dot: 'bg-yellow-400',
    active:
      'border-yellow-500/60 bg-yellow-500/10 text-yellow-400'
  },
  {
    value: 'Critical',
    label: 'Critical',
    description: 'Immediate action required',
    dot: 'bg-red-500',
    active:
      'border-red-500/60 bg-red-500/10 text-red-400'
  }
];

// ============================================================
// NORMALIZE EDIT USER IDS
// ============================================================

function normalizeEditUserIds(task) {
  // assigned_user_ids: [1, 2, 3]
  if (
    Array.isArray(task?.assigned_user_ids) &&
    task.assigned_user_ids.length
  ) {
    return task.assigned_user_ids
      .map((item) => {
        if (
          typeof item === 'object' &&
          item !== null
        ) {
          return String(
            item.id ||
            item.user_id ||
            item.userId ||
            ''
          );
        }

        return String(item);
      })
      .filter(Boolean);
  }

  // user_ids: [1, 2, 3]
  if (
    Array.isArray(task?.user_ids) &&
    task.user_ids.length
  ) {
    return task.user_ids
      .map((item) => {
        if (
          typeof item === 'object' &&
          item !== null
        ) {
          return String(
            item.id ||
            item.user_id ||
            item.userId ||
            ''
          );
        }

        return String(item);
      })
      .filter(Boolean);
  }

  // assigned_users: [{ id: 1 }, { id: 2 }]
  if (
    Array.isArray(task?.assigned_users) &&
    task.assigned_users.length
  ) {
    return task.assigned_users
      .map((user) =>
        String(
          user?.id ||
          user?.user_id ||
          user?.userId ||
          ''
        )
      )
      .filter(Boolean);
  }

  // assignments: [{ user_id: 1 }, { user_id: 2 }]
  if (
    Array.isArray(task?.assignments) &&
    task.assignments.length
  ) {
    return task.assignments
      .map((assignment) =>
        String(
          assignment?.user_id ||
          assignment?.userId ||
          assignment?.id ||
          ''
        )
      )
      .filter(Boolean);
  }

  // Single user fallback
  if (task?.user_id) {
    return [String(task.user_id)];
  }

  return [];
}

// ============================================================
// NORMALIZE MEDIA PATH
// ============================================================

function getMediaUrl(path) {
  if (!path) return '';

  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('blob:') ||
    path.startsWith('data:')
  ) {
    return path;
  }

  const cleanPath = String(path).replace(/^\/+/, '');

  if (!mediaBaseUrl) {
    return `/${cleanPath}`;
  }

  return `${mediaBaseUrl}/${cleanPath}`;
}

// ============================================================
// FILE TYPE DETECTOR
// ============================================================

function detectFileType(fileItem) {
  const type = fileItem?.file?.type || fileItem?.type || '';
  const name = fileItem?.file?.name || fileItem?.name || '';
  const url = fileItem?.preview || '';

  const source = name || url;
  const cleanSource = source.split('?')[0].split('#')[0];
  const extension = cleanSource.split('.').pop()?.toLowerCase() || '';

  const imageExtensions = [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'bmp',
    'svg'
  ];

  const videoExtensions = [
    'mp4',
    'webm',
    'mov',
    'avi',
    'mkv',
    'm4v'
  ];

  const audioExtensions = [
    'mp3',
    'wav',
    'ogg',
    'm4a',
    'aac',
    'opus'
  ];

  if (
    type.startsWith('image/') ||
    imageExtensions.includes(extension)
  ) {
    return 'image';
  }

  if (
    type.startsWith('video/') ||
    videoExtensions.includes(extension)
  ) {
    return 'video';
  }

  if (
    type.startsWith('audio/') ||
    audioExtensions.includes(extension)
  ) {
    return 'audio';
  }

  return 'file';
}

// ============================================================
// FILE NAME
// ============================================================

function getFileName(fileItem, index) {
  if (fileItem?.file?.name) {
    return fileItem.file.name;
  }

  if (fileItem?.name) {
    return fileItem.name;
  }

  if (fileItem?.preview) {
    try {
      const clean = fileItem.preview.split('?')[0];
      const name = clean.split('/').pop();

      if (name) {
        return decodeURIComponent(name);
      }
    } catch (error) {
      // Ignore decode error
    }
  }

  return `Attachment ${index + 1}`;
}

// ============================================================
// FORMAT FILE SIZE
// ============================================================

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';

  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  const value = bytes / Math.pow(1024, index);

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

// ============================================================
// FORMAT RECORDING TIME
// ============================================================

function formatRecordingTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(
    remainingSeconds
  ).padStart(2, '0')}`;
}

// ============================================================
// GET SUPPORTED AUDIO MIME TYPE
// ============================================================

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }

  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ];

  return (
    types.find((type) => MediaRecorder.isTypeSupported(type)) || ''
  );
}

// ============================================================
// GET SUPPORTED VIDEO MIME TYPE
// ============================================================

function getSupportedVideoMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }

  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4'
  ];

  return (
    types.find((type) => MediaRecorder.isTypeSupported(type)) || ''
  );
}

// ============================================================
// PLAY CAMERA SHUTTER SOUND
// ============================================================
// Generates a short shutter "click" beep using the Web Audio API
// so a photo capture always makes an audible sound, even though
// no external audio file/asset is bundled with the app.

function playShutterSound() {
  try {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    const audioCtx = new AudioContextClass();

    const now = audioCtx.currentTime;

    // First quick high click
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();

    osc1.type = 'square';
    osc1.frequency.setValueAtTime(1800, now);

    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.exponentialRampToValueAtTime(0.35, now + 0.005);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);

    osc1.start(now);
    osc1.stop(now + 0.05);

    // Second lower click right after, mimicking a shutter
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();

    osc2.type = 'square';
    osc2.frequency.setValueAtTime(900, now + 0.06);

    gain2.gain.setValueAtTime(0.0001, now + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.25, now + 0.065);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);

    osc2.start(now + 0.06);
    osc2.stop(now + 0.12);

    setTimeout(() => {
      audioCtx.close().catch(() => {});
    }, 300);
  } catch (error) {
    // Ignore audio errors - shutter sound is a non-critical enhancement
    console.warn('SHUTTER SOUND ERROR:', error);
  }
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function AssignTasks() {
  // ==========================================================
  // STATE
  // ==========================================================

  const [staff, setStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffSearch, setStaffSearch] = useState('');

  const [files, setFiles] = useState([]);
  const filesRef = useRef([]);
  const [removedOldFiles, setRemovedOldFiles] = useState([]);

  const [toast, setToast] = useState(null);

  const [formData, setFormData] = useState({
    ...initialFormData
  });

  const [isEdit, setIsEdit] = useState(false);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // ==========================================================
  // VOICE RECORDING
  // ==========================================================

  const audioRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRecordingStartRef = useRef(null);
  const audioRecordingTimerRef = useRef(null);
  const audioStreamRef = useRef(null);

  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // ==========================================================
  // CAMERA + VIDEO RECORDING
  // ==========================================================

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraStreamRef = useRef(null);

  const videoRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);
  const videoRecordingStartRef = useRef(null);
  const videoRecordingTimerRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoRecordingSeconds, setVideoRecordingSeconds] =
    useState(0);

  // ==========================================================
  // FILE INPUT
  // ==========================================================

  const fileInputRef = useRef(null);

  // ==========================================================
  // TOAST
  // ==========================================================

  const toastTimerRef = useRef(null);

  const showToast = (msg, type = 'success') => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToast({
      msg,
      type
    });

    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // ==========================================================
  // KEEP FILE REF UPDATED
  // ==========================================================

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // ==========================================================
  // PUBLIC MODE ACCESS DENIED
  // ==========================================================

  if (isPublic()) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-full max-w-lg bg-[#020617] border border-red-500/20 rounded-[2rem] p-10 text-center shadow-2xl">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-red-500/10 text-red-400 flex items-center justify-center">
            <ShieldAlert size={30} />
          </div>

          <h2 className="text-2xl font-black text-white">
            Access Denied
          </h2>

          <p className="text-slate-500 text-sm mt-2">
            Task assignment is not available in public mode.
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================
  // FETCH STAFF
  // ==========================================================

  const fetchStaff = async () => {
    setStaffLoading(true);

    try {
      const response = await API.get('/user/all');

      setStaff(
        Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch (error) {
      console.error(
        'STAFF LOAD ERROR:',
        error?.response?.data || error
      );

      showToast(
        error?.response?.data?.error ||
          'Failed to load staff members',
        'error'
      );

      setStaff([]);
    } finally {
      setStaffLoading(false);
    }
  };

  // ==========================================================
// LOAD EDIT TASK - FRESH DATA FROM BACKEND
// ==========================================================

useEffect(() => {
  let cancelled = false;

  const loadEditTask = async () => {
    const storedTask = localStorage.getItem('editTask');

    if (!storedTask) {
      return;
    }

    try {
      // ------------------------------------------------------
      // 1. GET TASK ID FROM LOCAL STORAGE
      // ------------------------------------------------------

      let parsedStoredTask;

      try {
        parsedStoredTask = JSON.parse(storedTask);
      } catch (parseError) {
        parsedStoredTask = storedTask;
      }

      const taskId =
        typeof parsedStoredTask === 'object' &&
        parsedStoredTask !== null
          ? parsedStoredTask.id ||
            parsedStoredTask.task_id ||
            parsedStoredTask.taskId
          : parsedStoredTask;

      if (!taskId) {
        throw new Error(
          'Task ID not found in editTask localStorage data'
        );
      }

      setIsEdit(true);
      setEditId(taskId);

      // ------------------------------------------------------
      // 2. FETCH FRESH COMPLETE TASK FROM BACKEND
      // ------------------------------------------------------

      const response = await API.get(`/task/${taskId}`);

      if (cancelled) {
        return;
      }

      console.log(
        'EDIT TASK API RESPONSE:',
        response.data
      );

      const task =
        response?.data?.task ||
        response?.data?.data ||
        response?.data;

      if (!task || typeof task !== 'object') {
        throw new Error(
          'Invalid task data received from backend'
        );
      }

      // ------------------------------------------------------
      // 3. NORMALIZE ASSIGNED USER IDS
      // ------------------------------------------------------

      const parsedUserIds = normalizeEditUserIds(task);

      // ------------------------------------------------------
      // 4. SET FRESH FORM DATA
      // ------------------------------------------------------

      setFormData({
        title: task.title || '',
        description: task.description || '',
        category: task.category || 'Electrical',
        priority: task.priority || 'High',

        user_id:
          parsedUserIds[0] ||
          String(task.user_id || ''),

        user_ids: parsedUserIds,

        status: task.status || 'Pending'
      });

      // ------------------------------------------------------
      // 5. NORMALIZE ALL EXISTING ATTACHMENTS
      // ------------------------------------------------------

      let mediaItems = [];

      if (
        Array.isArray(task.media) &&
        task.media.length > 0
      ) {
        mediaItems = task.media;
      } else if (
        Array.isArray(task.files) &&
        task.files.length > 0
      ) {
        mediaItems = task.files;
      } else if (
        Array.isArray(task.attachments) &&
        task.attachments.length > 0
      ) {
        mediaItems = task.attachments;
      } else if (task.file_url) {
        try {
          const parsedFiles =
            typeof task.file_url === 'string'
              ? JSON.parse(task.file_url)
              : task.file_url;

          if (Array.isArray(parsedFiles)) {
            mediaItems = parsedFiles;
          } else if (parsedFiles) {
            mediaItems = [parsedFiles];
          }
        } catch (error) {
          mediaItems = [task.file_url];
        }
      }

      console.log(
        'EDIT TASK RAW MEDIA:',
        mediaItems
      );

      // ------------------------------------------------------
      // 6. CONVERT ATTACHMENTS TO FRONTEND FORMAT
      // ------------------------------------------------------

      const existingFiles = mediaItems
        .map((media, index) => {
          if (typeof media === 'string') {
            const cleanMedia = media.trim();

            if (!cleanMedia) {
              return null;
            }

            return {
              file: null,
              preview: getMediaUrl(cleanMedia),
              originalPath: cleanMedia,
              type: '',
              name:
                cleanMedia
                  .split('?')[0]
                  .split('/')
                  .pop() ||
                `Attachment ${index + 1}`,
              isOld: true
            };
          }

          if (
            typeof media === 'object' &&
            media !== null
          ) {
            const path =
              media.path ||
              media.url ||
              media.file_url ||
              media.fileUrl ||
              media.filename ||
              media.file_path ||
              media.filePath ||
              '';

            if (!path) {
              return null;
            }

            return {
              file: null,
              preview: getMediaUrl(path),
              originalPath: path,

              type:
                media.type ||
                media.mimetype ||
                media.mimeType ||
                '',

              name:
                media.name ||
                media.originalname ||
                media.originalName ||
                String(path)
                  .split('?')[0]
                  .split('/')
                  .pop() ||
                `Attachment ${index + 1}`,

              isOld: true
            };
          }

          return null;
        })
        .filter(Boolean);

      console.log(
        'EDIT TASK NORMALIZED FILES:',
        existingFiles
      );

      // ------------------------------------------------------
      // 7. SET EXISTING FILES
      // ------------------------------------------------------

      setFiles(existingFiles);
      setRemovedOldFiles([]);

      showToast(
        `Task #${taskId} loaded successfully`
      );
    } catch (error) {
      if (cancelled) {
        return;
      }

      console.error(
        'EDIT TASK LOAD ERROR:',
        error?.response?.data || error
      );

      setIsEdit(false);
      setEditId(null);

      setFiles([]);
      setRemovedOldFiles([]);

      showToast(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          'Failed to load complete task data',
        'error'
      );
    } finally {
      localStorage.removeItem('editTask');
    }
  };

  loadEditTask();

  return () => {
    cancelled = true;
  };
}, []);

  // ==========================================================
  // INITIAL STAFF LOAD
  // ==========================================================

  useEffect(() => {
    fetchStaff();
  }, []);

  // ==========================================================
  // CLEANUP
  // ==========================================================

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }

      if (audioRecordingTimerRef.current) {
        clearInterval(audioRecordingTimerRef.current);
      }

      if (videoRecordingTimerRef.current) {
        clearInterval(videoRecordingTimerRef.current);
      }

      audioStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());

      cameraStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());

      filesRef.current.forEach((item) => {
        if (
          !item.isOld &&
          item.preview?.startsWith('blob:')
        ) {
          URL.revokeObjectURL(item.preview);
        }
      });
    };
  }, []);

  // ==========================================================
  // FILTERED STAFF
  // ==========================================================

  const filteredStaff = useMemo(() => {
    const query = staffSearch.trim().toLowerCase();

    if (!query) {
      return staff;
    }

    return staff.filter((member) => {
      return [
        member?.name,
        member?.email,
        member?.role,
        member?.employeeID,
        member?.phone
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        );
    });
  }, [staff, staffSearch]);

  // ==========================================================
  // SELECTED STAFF
  // ==========================================================

  const selectedStaff = useMemo(() => {
    const selectedIds = (formData.user_ids || []).map(String);

    return staff.filter((member) =>
      selectedIds.includes(String(member.id))
    );
  }, [staff, formData.user_ids]);

  // ==========================================================
  // UPDATE FIELD
  // ==========================================================

  const updateField = (field, value) => {
    setFormData((previous) => ({
      ...previous,
      [field]: value
    }));
  };

  // ==========================================================
  // TOGGLE STAFF
  // ==========================================================

  const toggleStaff = (memberId) => {
    const id = String(memberId);

    setFormData((previous) => {
      const currentIds = Array.isArray(previous.user_ids)
        ? previous.user_ids.map(String)
        : [];

      const exists = currentIds.includes(id);

      const nextIds = exists
        ? currentIds.filter((currentId) => currentId !== id)
        : [...currentIds, id];

      return {
        ...previous,
        user_ids: nextIds,
        user_id: nextIds[0] || ''
      };
    });
  };

  // ==========================================================
  // SELECT ALL VISIBLE STAFF
  // ==========================================================

  const selectAllVisibleStaff = () => {
    const visibleIds = filteredStaff.map((member) =>
      String(member.id)
    );

    setFormData((previous) => {
      const existing = new Set(
        (previous.user_ids || []).map(String)
      );

      visibleIds.forEach((id) => existing.add(id));

      const nextIds = Array.from(existing);

      return {
        ...previous,
        user_ids: nextIds,
        user_id: nextIds[0] || ''
      };
    });
  };

  // ==========================================================
  // CLEAR SELECTED STAFF
  // ==========================================================

  const clearSelectedStaff = () => {
    setFormData((previous) => ({
      ...previous,
      user_id: '',
      user_ids: []
    }));
  };

  // ==========================================================
  // ADD FILE
  // ==========================================================

  const addFile = (file) => {
  if (!file) {
    console.error('ADD FILE ERROR: No file received');
    return false;
  }

  if (!(file instanceof window.Blob)) {
    console.error('ADD FILE ERROR: Invalid file/blob:', file);

    showToast(
      'Invalid attachment received',
      'error'
    );

    return false;
  }

  if (file.size === 0) {
    showToast(
      `${file.name || 'Attachment'} is empty and cannot be uploaded`,
      'error'
    );

    return false;
  }

  const maximumSize = 100 * 1024 * 1024;

  if (file.size > maximumSize) {
    showToast(
      `${file.name || 'Attachment'} is larger than 100 MB`,
      'error'
    );

    return false;
  }

  try {
    const preview = URL.createObjectURL(file);

    const newItem = {
      file,
      preview,
      type: file.type || 'application/octet-stream',
      name: file.name || `attachment-${Date.now()}`,
      isOld: false
    };

    console.log('ATTACHMENT ADDED:', {
      name: newItem.name,
      type: newItem.type,
      size: file.size,
      isFile: file instanceof window.File,
      isBlob: file instanceof window.Blob
    });

    setFiles((previous) => [
      ...previous,
      newItem
    ]);

    return true;
  } catch (error) {
    console.error('CREATE PREVIEW ERROR:', error);

    showToast(
      'Unable to add attachment preview',
      'error'
    );

    return false;
  }
};

  // ==========================================================
  // HANDLE FILE INPUT
  // ==========================================================

  const handleFile = (event) => {
    const selectedFiles = Array.from(
      event.target.files || []
    );

    selectedFiles.forEach(addFile);

    event.target.value = '';
  };

  // ==========================================================
  // DRAG AND DROP
  // ==========================================================

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(
      event.dataTransfer.files || []
    );

    droppedFiles.forEach(addFile);
  };

  // ==========================================================
  // REMOVE FILE
  // ==========================================================

  const removeFile = (indexToRemove) => {
    setFiles((previous) => {
      const removed = previous[indexToRemove];

      if (!removed) {
        return previous;
      }

      if (removed.isOld) {
        let cleanPath =
          removed.originalPath ||
          removed.preview ||
          '';

        if (
          mediaBaseUrl &&
          cleanPath.startsWith(`${mediaBaseUrl}/`)
        ) {
          cleanPath = cleanPath.replace(
            `${mediaBaseUrl}/`,
            ''
          );
        }

        cleanPath = cleanPath.replace(/^\/+/, '');

        if (cleanPath) {
          setRemovedOldFiles((current) => {
            if (current.includes(cleanPath)) {
              return current;
            }

            return [...current, cleanPath];
          });
        }
      } else if (
        removed.preview &&
        removed.preview.startsWith('blob:')
      ) {
        URL.revokeObjectURL(removed.preview);
      }

      return previous.filter(
        (_, index) => index !== indexToRemove
      );
    });
  };

  // ==========================================================
  // START VOICE RECORDING
  // ==========================================================

  const startRecording = async () => {
    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      showToast(
        'Voice recording is not supported by this browser',
        'error'
      );

      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      showToast(
        'Media recording is not supported by this browser',
        'error'
      );

      return;
    }

    if (recording || videoRecording) {
      showToast(
        'Another recording is already in progress',
        'error'
      );

      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      const selectedType = getSupportedAudioMimeType();

      const recorder = selectedType
        ? new MediaRecorder(stream, {
            mimeType: selectedType
          })
        : new MediaRecorder(stream);

      audioRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const duration =
          Date.now() -
          (audioRecordingStartRef.current || Date.now());

        stream
          .getTracks()
          .forEach((track) => track.stop());

        audioStreamRef.current = null;
        audioRecorderRef.current = null;

        if (audioRecordingTimerRef.current) {
          clearInterval(audioRecordingTimerRef.current);
          audioRecordingTimerRef.current = null;
        }

        setRecording(false);
        setRecordingSeconds(0);

        if (duration < 2000) {
          audioChunksRef.current = [];

          showToast(
            'Voice recording must be at least 2 seconds',
            'error'
          );

          return;
        }

        if (audioChunksRef.current.length === 0) {
          showToast(
            'No audio data was recorded',
            'error'
          );

          return;
        }

        const mimeType =
          recorder.mimeType ||
          selectedType ||
          'audio/webm';

        let extension = 'webm';

        if (mimeType.includes('ogg')) {
          extension = 'ogg';
        } else if (mimeType.includes('mp4')) {
          extension = 'm4a';
        }

        const blob = new Blob(
          audioChunksRef.current,
          {
            type: mimeType
          }
        );

        audioChunksRef.current = [];

        if (blob.size === 0) {
          showToast(
            'Recorded audio is empty',
            'error'
          );

          return;
        }

       const audioFile = new window.File(
  [blob],
  `voice-${Date.now()}.${extension}`,
  {
    type: mimeType,
    lastModified: Date.now()
  }
);
        const added = addFile(audioFile);

        if (added) {
          showToast(
            'Voice recording added successfully'
          );
        }
      };

      recorder.onerror = (event) => {
        console.error(
          'VOICE RECORDER ERROR:',
          event
        );

        stream
          .getTracks()
          .forEach((track) => track.stop());

        audioStreamRef.current = null;
        audioRecorderRef.current = null;

        if (audioRecordingTimerRef.current) {
          clearInterval(audioRecordingTimerRef.current);
          audioRecordingTimerRef.current = null;
        }

        setRecording(false);
        setRecordingSeconds(0);

        showToast(
          'Voice recording failed',
          'error'
        );
      };

      recorder.start(250);

      audioRecordingStartRef.current = Date.now();

      setRecording(true);
      setRecordingSeconds(0);

      audioRecordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((previous) => previous + 1);
      }, 1000);
    } catch (error) {
      console.error('MIC ERROR:', error);

      showToast(
        'Microphone permission denied or unavailable',
        'error'
      );
    }
  };

  // ==========================================================
  // STOP VOICE RECORDING
  // ==========================================================

  const stopRecording = () => {
    const recorder = audioRecorderRef.current;

    if (
      recorder &&
      recorder.state !== 'inactive'
    ) {
      try {
        recorder.requestData();
      } catch (error) {
        // Ignore requestData errors
      }

      recorder.stop();
      return;
    }

    audioStreamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());

    audioStreamRef.current = null;

    if (audioRecordingTimerRef.current) {
      clearInterval(audioRecordingTimerRef.current);
      audioRecordingTimerRef.current = null;
    }

    setRecording(false);
    setRecordingSeconds(0);
  };

  // ==========================================================
  // START CAMERA
  // ==========================================================

  const startCamera = async () => {
    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      showToast(
        'Camera is not supported by this browser',
        'error'
      );

      return;
    }

    if (cameraOn && cameraStreamRef.current) {
      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: 'environment'
            },
            width: {
              ideal: 1280
            },
            height: {
              ideal: 720
            }
          },
          audio: false
        });

      cameraStreamRef.current = stream;

      setCameraOn(true);

      setTimeout(async () => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          try {
            await videoRef.current.play();
          } catch (error) {
            console.error(
              'VIDEO PLAY ERROR:',
              error
            );
          }
        }
      }, 50);
    } catch (error) {
      console.error('CAMERA ERROR:', error);

      showToast(
        'Camera permission denied or unavailable',
        'error'
      );
    }
  };

  // ==========================================================
  // STOP CAMERA
  // ==========================================================

  const stopCamera = () => {
    if (videoRecording) {
      showToast(
        'Stop video recording before closing the camera',
        'error'
      );

      return;
    }

    cameraStreamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());

    cameraStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOn(false);
  };

  // ==========================================================
  // CAPTURE PHOTO
  // ==========================================================

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      showToast(
        'Camera is not ready',
        'error'
      );

      return;
    }

    if (videoRecording) {
      showToast(
        'Stop video recording before capturing a photo',
        'error'
      );

      return;
    }

    if (
      !video.videoWidth ||
      !video.videoHeight
    ) {
      showToast(
        'Please wait for the camera to load',
        'error'
      );

      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');

    if (!context) {
      showToast(
        'Unable to capture photo',
        'error'
      );

      return;
    }

    // Play the shutter sound right at the moment of capture
    playShutterSound();

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob(
      (blob) => {
        if (!blob || blob.size === 0) {
          showToast(
            'Photo capture failed',
            'error'
          );

          return;
        }

     const capturedFile = new window.File(
  [blob],
  `capture-${Date.now()}.jpg`,
  {
    type: 'image/jpeg',
    lastModified: Date.now()
  }
);

        const added = addFile(capturedFile);

        if (added) {
          showToast(
            'Photo captured and added successfully'
          );
        }
      },
      'image/jpeg',
      0.92
    );
  };

  // ==========================================================
  // START VIDEO RECORDING
  // ==========================================================

  const startVideoRecording = async () => {
    if (typeof MediaRecorder === 'undefined') {
      showToast(
        'Video recording is not supported by this browser',
        'error'
      );

      return;
    }

    if (recording) {
      showToast(
        'Stop voice recording before recording a video',
        'error'
      );

      return;
    }

    if (videoRecording) {
      return;
    }

    let stream = cameraStreamRef.current;

    if (!stream || stream.getVideoTracks().length === 0) {
      showToast(
        'Please open the camera first',
        'error'
      );

      return;
    }

    try {
      const videoTracks = stream.getVideoTracks();

      if (!videoTracks.length) {
        showToast(
          'No active camera track found',
          'error'
        );

        return;
      }

      let audioStream = null;

      try {
        audioStream =
          await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
      } catch (audioError) {
        console.warn(
          'VIDEO MICROPHONE NOT AVAILABLE:',
          audioError
        );
      }

      const combinedTracks = [
        ...videoTracks,
        ...(audioStream
          ? audioStream.getAudioTracks()
          : [])
      ];

      const recordingStream = new MediaStream(
        combinedTracks
      );

      videoChunksRef.current = [];

      const selectedType = getSupportedVideoMimeType();

      const recorder = selectedType
        ? new MediaRecorder(recordingStream, {
            mimeType: selectedType
          })
        : new MediaRecorder(recordingStream);

      videoRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          videoChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (audioStream) {
          audioStream
            .getTracks()
            .forEach((track) => track.stop());
        }

        recordingStream
          .getTracks()
          .filter((track) => track.kind === 'audio')
          .forEach((track) => track.stop());

        if (videoRecordingTimerRef.current) {
          clearInterval(videoRecordingTimerRef.current);
          videoRecordingTimerRef.current = null;
        }

        const duration =
          Date.now() -
          (videoRecordingStartRef.current || Date.now());

        setVideoRecording(false);
        setVideoRecordingSeconds(0);

        if (duration < 2000) {
          videoChunksRef.current = [];

          showToast(
            'Video recording must be at least 2 seconds',
            'error'
          );

          return;
        }

        if (videoChunksRef.current.length === 0) {
          showToast(
            'No video data was recorded',
            'error'
          );

          return;
        }

        const mimeType =
          recorder.mimeType ||
          selectedType ||
          'video/webm';

        const extension = mimeType.includes('mp4')
          ? 'mp4'
          : 'webm';

        const blob = new Blob(
          videoChunksRef.current,
          {
            type: mimeType
          }
        );

        videoChunksRef.current = [];
        videoRecorderRef.current = null;

        if (blob.size === 0) {
          showToast(
            'Recorded video is empty',
            'error'
          );

          return;
        }

     const videoFile = new window.File(
  [blob],
  `video-${Date.now()}.${extension}`,
  {
    type: mimeType,
    lastModified: Date.now()
  }
);

        const added = addFile(videoFile);

        if (added) {
          showToast(
            'Video recorded and added successfully'
          );
        }
      };

      recorder.onerror = (event) => {
        console.error(
          'VIDEO RECORDER ERROR:',
          event
        );

        if (audioStream) {
          audioStream
            .getTracks()
            .forEach((track) => track.stop());
        }

        if (videoRecordingTimerRef.current) {
          clearInterval(videoRecordingTimerRef.current);
          videoRecordingTimerRef.current = null;
        }

        setVideoRecording(false);
        setVideoRecordingSeconds(0);

        showToast(
          'Video recording failed',
          'error'
        );
      };

      recorder.start(250);

      videoRecordingStartRef.current = Date.now();

      setVideoRecording(true);
      setVideoRecordingSeconds(0);

      videoRecordingTimerRef.current = setInterval(() => {
        setVideoRecordingSeconds(
          (previous) => previous + 1
        );
      }, 1000);

      showToast(
        audioStream
          ? 'Video recording started with audio'
          : 'Video recording started without audio'
      );
    } catch (error) {
      console.error(
        'START VIDEO RECORDING ERROR:',
        error
      );

      showToast(
        'Unable to start video recording',
        'error'
      );
    }
  };

  // ==========================================================
  // STOP VIDEO RECORDING
  // ==========================================================

  const stopVideoRecording = () => {
    const recorder = videoRecorderRef.current;

    if (
      recorder &&
      recorder.state !== 'inactive'
    ) {
      try {
        recorder.requestData();
      } catch (error) {
        // Ignore requestData errors
      }

      recorder.stop();
      return;
    }

    if (videoRecordingTimerRef.current) {
      clearInterval(videoRecordingTimerRef.current);
      videoRecordingTimerRef.current = null;
    }

    setVideoRecording(false);
    setVideoRecordingSeconds(0);
  };

  // ==========================================================
  // APPEND TASK PAYLOAD
  // ==========================================================

  const appendTaskPayload = (
    payload,
    selectedUserIds
  ) => {
    payload.append(
      'title',
      formData.title.trim()
    );

    payload.append(
      'description',
      formData.description || ''
    );

    payload.append(
      'category',
      formData.category || 'Electrical'
    );

    payload.append(
      'priority',
      formData.priority || 'High'
    );

    payload.append(
      'user_id',
      selectedUserIds[0] || ''
    );

    selectedUserIds.forEach((userId) => {
      payload.append('user_ids[]', userId);
    });

    if (formData.status) {
      payload.append(
        'status',
        formData.status
      );
    }

   files.forEach((fileItem) => {
  if (
    fileItem.file &&
    fileItem.file instanceof window.File
  ) {
    payload.append(
      'files',
      fileItem.file,
      fileItem.file.name
    );
  }
});
  };

  // ==========================================================
  // RESET FORM
  // ==========================================================

  const resetForm = () => {
    if (recording) {
      stopRecording();
    }

    if (videoRecording) {
      stopVideoRecording();
    }

    cameraStreamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());

    cameraStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOn(false);

    files.forEach((item) => {
      if (
        !item.isOld &&
        item.preview?.startsWith('blob:')
      ) {
        URL.revokeObjectURL(item.preview);
      }
    });

    setFormData({
      ...initialFormData
    });

    setFiles([]);
    setRemovedOldFiles([]);
    setStaffSearch('');
    setIsEdit(false);
    setEditId(null);
    setRecordingSeconds(0);
    setVideoRecordingSeconds(0);

    localStorage.removeItem('editTask');
  };

  // ==========================================================
  // HANDLE SUBMIT
  // ==========================================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    if (recording) {
      showToast(
        'Please stop voice recording before submitting',
        'error'
      );

      return;
    }

    if (videoRecording) {
      showToast(
        'Please stop video recording before submitting',
        'error'
      );

      return;
    }

    const selectedUserIds =
      formData.user_ids?.length > 0
        ? formData.user_ids.map(String)
        : formData.user_id
          ? [String(formData.user_id)]
          : [];

    if (!formData.title.trim()) {
      showToast(
        'Task title is required',
        'error'
      );

      return;
    }

    if (formData.title.trim().length < 3) {
      showToast(
        'Task title must contain at least 3 characters',
        'error'
      );

      return;
    }

    if (selectedUserIds.length === 0) {
      showToast(
        'Please select at least one staff member',
        'error'
      );

      return;
    }

    if (!isEdit && files.length === 0) {
      showToast(
        'Please add at least one attachment',
        'error'
      );

      return;
    }

    setLoading(true);

    try {
      const payload = new FormData();

      appendTaskPayload(
        payload,
        selectedUserIds
      );

      if (isEdit) {
        payload.append(
          'removedFiles',
          JSON.stringify(removedOldFiles)
        );

        const response = await API.put(
          `/task/${editId}`,
          payload,
          {
            timeout: 120000
          }
        );

        showToast(
          response?.data?.msg ||
            'Task updated successfully'
        );
      } else {
        const response = await API.post(
          '/task/assign',
          payload,
          {
            timeout: 120000
          }
        );

        showToast(
          response?.data?.msg ||
            'Task assigned successfully'
        );
      }

      files.forEach((item) => {
        if (
          !item.isOld &&
          item.preview?.startsWith('blob:')
        ) {
          URL.revokeObjectURL(item.preview);
        }
      });

      setFiles([]);
      setRemovedOldFiles([]);

      setFormData({
        ...initialFormData
      });

      setIsEdit(false);
      setEditId(null);
      setStaffSearch('');
    } catch (error) {
      console.error(
        'TASK SUBMIT ERROR:',
        error?.response?.data || error
      );

      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Task submission failed';

      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================
  // COUNTERS
  // ==========================================================

  const newFilesCount = files.filter(
    (item) => !item.isOld
  ).length;

  const oldFilesCount = files.filter(
    (item) => item.isOld
  ).length;

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div className="min-h-screen text-white animate-in fade-in duration-500">

      {/* PAGE HEADER */}

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 mb-8">

        <div className="flex items-start sm:items-center gap-4">

          <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-yellow-500 rounded-2xl flex items-center justify-center text-black shadow-lg shadow-yellow-500/20">
            {isEdit ? (
              <ClipboardList size={27} />
            ) : (
              <Send size={27} />
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-3">

              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                {isEdit
                  ? 'Edit Task'
                  : 'Assign New Task'}
              </h1>

              {isEdit && (
                <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-wider">
                  Task #{editId}
                </span>
              )}

            </div>

            <p className="text-slate-500 text-sm mt-1">
              {isEdit
                ? 'Update task details, assigned staff and attachments.'
                : 'Create and assign a complete operational task to one or multiple staff members.'}
            </p>
          </div>

        </div>

        <div className="flex flex-wrap gap-3">

          <button
            type="button"
            onClick={fetchStaff}
            disabled={staffLoading}
            className="h-11 px-4 rounded-xl bg-[#111827] border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-wide disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={
                staffLoading
                  ? 'animate-spin'
                  : ''
              }
            />

            Refresh Staff
          </button>

          <button
            type="button"
            onClick={resetForm}
            disabled={loading}
            className="h-11 px-5 rounded-xl bg-[#111827] border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-wide disabled:opacity-50"
          >
            <RefreshCw size={16} />
            Reset
          </button>

        </div>

      </div>

      {/* QUICK STATS */}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">

        <div className="bg-[#020617] border border-white/5 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-yellow-500/10 text-yellow-400 flex items-center justify-center">
            <Users size={21} />
          </div>

          <div>
            <p className="text-2xl font-black text-white">
              {staff.length}
            </p>

            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.16em]">
              Total Staff
            </p>
          </div>
        </div>

        <div className="bg-[#020617] border border-white/5 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <UserCheck size={21} />
          </div>

          <div>
            <p className="text-2xl font-black text-white">
              {selectedStaff.length}
            </p>

            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.16em]">
              Selected
            </p>
          </div>
        </div>

        <div className="bg-[#020617] border border-white/5 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
            <Paperclip size={21} />
          </div>

          <div>
            <p className="text-2xl font-black text-white">
              {files.length}
            </p>

            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.16em]">
              Attachments
            </p>
          </div>
        </div>

        <div className="bg-[#020617] border border-white/5 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center">
            <Zap size={21} />
          </div>

          <div>
            <p className="text-lg font-black text-white truncate">
              {formData.priority}
            </p>

            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.16em]">
              Priority
            </p>
          </div>
        </div>

      </div>

      {/* MAIN FORM */}

      <form
        onSubmit={handleSubmit}
        className="space-y-6"
      >

        {/* TASK DETAILS */}

        <section className="bg-[#020617] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">

          <div className="px-5 md:px-7 py-5 border-b border-white/5 flex items-center gap-3">

            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-400 flex items-center justify-center">
              <ClipboardList size={19} />
            </div>

            <div>
              <h2 className="text-base font-black text-white">
                Task Information
              </h2>

              <p className="text-[11px] text-slate-500 mt-0.5">
                Enter the complete operational task details.
              </p>
            </div>

          </div>

          <div className="p-5 md:p-7">

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              <div className="lg:col-span-2">

                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.18em] mb-2">
                  Task Title
                  <span className="text-red-400 ml-1">
                    *
                  </span>
                </label>

                <input
                  type="text"
                  value={formData.title}
                  onChange={(event) =>
                    updateField(
                      'title',
                      event.target.value
                    )
                  }
                  placeholder="Example: Inspect main distribution panel DB-01"
                  maxLength={200}
                  className="w-full h-12 px-4 bg-[#0f172a] border border-white/10 rounded-xl text-white placeholder:text-slate-600 outline-none focus:border-yellow-500/60 focus:ring-4 focus:ring-yellow-500/5 transition-all"
                />

                <div className="flex justify-end mt-1.5">
                  <span className="text-[10px] text-slate-600">
                    {formData.title.length}/200
                  </span>
                </div>

              </div>

              <div>

                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.18em] mb-2">
                  Task Category
                </label>

                <div className="relative">

                  <select
                    value={formData.category}
                    onChange={(event) =>
                      updateField(
                        'category',
                        event.target.value
                      )
                    }
                    className="w-full h-12 appearance-none px-4 pr-11 bg-[#0f172a] border border-white/10 rounded-xl text-white outline-none focus:border-yellow-500/60 transition-all cursor-pointer"
                  >
                    {categories.map((category) => (
                      <option
                        key={category}
                        value={category}
                      >
                        {category}
                      </option>
                    ))}
                  </select>

                  <ChevronDown
                    size={17}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                  />

                </div>

              </div>

              <div>

                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.18em] mb-2">
                  Task Status
                </label>

                <div className="relative">

                  <select
                    value={formData.status}
                    onChange={(event) =>
                      updateField(
                        'status',
                        event.target.value
                      )
                    }
                    className="w-full h-12 appearance-none px-4 pr-11 bg-[#0f172a] border border-white/10 rounded-xl text-white outline-none focus:border-yellow-500/60 transition-all cursor-pointer"
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

                    <option value="Rejected">
                      Rejected
                    </option>
                  </select>

                  <ChevronDown
                    size={17}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                  />

                </div>

              </div>

              <div className="lg:col-span-2">

                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.18em] mb-2">
                  Detailed Description
                </label>

                <textarea
                  value={formData.description}
                  onChange={(event) =>
                    updateField(
                      'description',
                      event.target.value
                    )
                  }
                  placeholder="Enter complete work details, instructions, safety precautions and expected outcome..."
                  rows={6}
                  maxLength={5000}
                  className="w-full px-4 py-3 bg-[#0f172a] border border-white/10 rounded-xl text-white placeholder:text-slate-600 outline-none focus:border-yellow-500/60 focus:ring-4 focus:ring-yellow-500/5 transition-all resize-y min-h-[140px]"
                />

                <div className="flex justify-end mt-1.5">
                  <span className="text-[10px] text-slate-600">
                    {formData.description.length}/5000
                  </span>
                </div>

              </div>

            </div>

          </div>

        </section>

        {/* PRIORITY */}

        <section className="bg-[#020617] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">

          <div className="px-5 md:px-7 py-5 border-b border-white/5 flex items-center gap-3">

            <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center">
              <AlertCircle size={19} />
            </div>

            <div>
              <h2 className="text-base font-black text-white">
                Task Priority
              </h2>

              <p className="text-[11px] text-slate-500 mt-0.5">
                Set the operational urgency of this task.
              </p>
            </div>

          </div>

          <div className="p-5 md:p-7">

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">

              {priorities.map((priority) => {
                const active =
                  formData.priority === priority.value;

                return (
                  <button
                    key={priority.value}
                    type="button"
                    onClick={() =>
                      updateField(
                        'priority',
                        priority.value
                      )
                    }
                    className={`relative text-left p-4 rounded-2xl border transition-all ${
                      active
                        ? priority.active
                        : 'border-white/5 bg-[#0f172a] text-slate-400 hover:border-white/10 hover:bg-white/[0.03]'
                    }`}
                  >

                    {active && (
                      <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-yellow-500 text-black flex items-center justify-center">
                        <Check size={13} strokeWidth={3} />
                      </div>
                    )}

                    <div
                      className={`w-3 h-3 rounded-full ${priority.dot} mb-3`}
                    />

                    <h3 className="font-black text-sm uppercase">
                      {priority.label}
                    </h3>

                    <p className="text-[10px] opacity-60 mt-1">
                      {priority.description}
                    </p>

                  </button>
                );
              })}

            </div>

          </div>

        </section>

        {/* STAFF SELECTION */}

        <section className="bg-[#020617] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">

          <div className="px-5 md:px-7 py-5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">

            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Users size={19} />
              </div>

              <div>
                <h2 className="text-base font-black text-white">
                  Assign Staff
                </h2>

                <p className="text-[11px] text-slate-500 mt-0.5">
                  Select one or multiple staff members.
                </p>
              </div>

            </div>

            <span className="px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[10px] font-black uppercase">
              {selectedStaff.length} Selected
            </span>

          </div>

          <div className="p-5 md:p-7">

            <div className="flex flex-col lg:flex-row gap-3 mb-5">

              <div className="relative flex-1">

                <Search
                  size={17}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                />

                <input
                  type="text"
                  value={staffSearch}
                  onChange={(event) =>
                    setStaffSearch(event.target.value)
                  }
                  placeholder="Search staff by name, email, role, employee ID or phone..."
                  className="w-full h-12 pl-11 pr-4 bg-[#0f172a] border border-white/10 rounded-xl text-white placeholder:text-slate-600 outline-none focus:border-yellow-500/60 transition-all"
                />

              </div>

              <button
                type="button"
                onClick={selectAllVisibleStaff}
                disabled={
                  staffLoading ||
                  filteredStaff.length === 0
                }
                className="h-12 px-5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500 hover:text-black transition-all text-xs font-black disabled:opacity-40"
              >
                Select Visible
              </button>

              <button
                type="button"
                onClick={clearSelectedStaff}
                disabled={
                  formData.user_ids.length === 0
                }
                className="h-12 px-5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all text-xs font-black disabled:opacity-40"
              >
                Clear
              </button>

            </div>

            {staffLoading ? (

              <div className="min-h-[220px] flex flex-col items-center justify-center bg-[#0f172a] border border-white/5 rounded-2xl">

                <Loader2
                  size={30}
                  className="animate-spin text-yellow-500"
                />

                <p className="text-slate-500 text-sm mt-3">
                  Loading staff members...
                </p>

              </div>

            ) : filteredStaff.length === 0 ? (

              <div className="min-h-[220px] flex flex-col items-center justify-center bg-[#0f172a] border border-white/5 rounded-2xl text-center p-6">

                <Users
                  size={34}
                  className="text-slate-700"
                />

                <h3 className="text-white font-black mt-4">
                  No Staff Found
                </h3>

                <p className="text-slate-500 text-xs mt-1">
                  Try another search term or refresh staff.
                </p>

              </div>

            ) : (

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">

                {filteredStaff.map((member) => {
                  const memberId = String(member.id);

                  const selected =
                    formData.user_ids
                      .map(String)
                      .includes(memberId);

                  const initial =
                    member?.name?.trim()?.[0]?.toUpperCase() ||
                    'U';

                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() =>
                        toggleStaff(member.id)
                      }
                      className={`relative text-left p-4 rounded-2xl border transition-all ${
                        selected
                          ? 'bg-yellow-500/10 border-yellow-500/50 shadow-lg shadow-yellow-500/5'
                          : 'bg-[#0f172a] border-white/5 hover:border-white/10 hover:bg-white/[0.03]'
                      }`}
                    >

                      <div className="flex items-center gap-3">

                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                            selected
                              ? 'bg-yellow-500 text-black'
                              : 'bg-slate-800 text-yellow-400'
                          }`}
                        >
                          {initial}
                        </div>

                        <div className="min-w-0 flex-1">

                          <h3 className="text-white text-sm font-black truncate">
                            {member.name || 'Unnamed User'}
                          </h3>

                          <p className="text-slate-500 text-[10px] truncate mt-0.5">
                            {member.email || 'No email'}
                          </p>

                          <div className="flex flex-wrap items-center gap-2 mt-2">

                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[8px] font-black uppercase">
                              {member.role || 'Staff'}
                            </span>

                            {member.employeeID && (
                              <span className="text-[8px] font-black text-slate-600 uppercase">
                                {member.employeeID}
                              </span>
                            )}

                          </div>

                        </div>

                        <div
                          className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${
                            selected
                              ? 'bg-yellow-500 border-yellow-500 text-black'
                              : 'border-white/10 text-transparent'
                          }`}
                        >
                          <Check size={14} strokeWidth={3} />
                        </div>

                      </div>

                    </button>
                  );
                })}

              </div>

            )}

            {selectedStaff.length > 0 && (

              <div className="mt-5 pt-5 border-t border-white/5">

                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.18em] mb-3">
                  Selected Staff
                </p>

                <div className="flex flex-wrap gap-2">

                  {selectedStaff.map((member) => (

                    <button
                      key={member.id}
                      type="button"
                      onClick={() =>
                        toggleStaff(member.id)
                      }
                      className="flex items-center gap-2 pl-3 pr-2 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-all"
                    >
                      <span className="text-[10px] font-black">
                        {member.name}
                      </span>

                      <X size={13} />
                    </button>

                  ))}

                </div>

              </div>

            )}

          </div>

        </section>

        {/* ATTACHMENTS */}

        <section className="bg-[#020617] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">

          <div className="px-5 md:px-7 py-5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">

            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Paperclip size={19} />
              </div>

              <div>
                <h2 className="text-base font-black text-white">
                  Task Attachments
                </h2>

                <p className="text-[11px] text-slate-500 mt-0.5">
                  Upload images, videos, audio, documents or capture media directly.
                </p>
              </div>

            </div>

            <div className="flex flex-wrap gap-2">

              {oldFilesCount > 0 && (
                <span className="px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-400 text-[9px] font-black uppercase">
                  {oldFilesCount} Existing
                </span>
              )}

              {newFilesCount > 0 && (
                <span className="px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase">
                  {newFilesCount} New
                </span>
              )}

            </div>

          </div>

          <div className="p-5 md:p-7">

            {/* UPLOAD AREA */}

            <div
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();

                if (
                  !event.currentTarget.contains(
                    event.relatedTarget
                  )
                ) {
                  setIsDragging(false);
                }
              }}
              onDrop={handleDrop}
              onClick={() =>
                fileInputRef.current?.click()
              }
              className={`relative min-h-[190px] border-2 border-dashed rounded-[1.5rem] flex flex-col items-center justify-center text-center p-6 cursor-pointer transition-all ${
                isDragging
                  ? 'border-yellow-500 bg-yellow-500/10 scale-[1.01]'
                  : 'border-yellow-500/30 bg-yellow-500/[0.025] hover:border-yellow-500/70 hover:bg-yellow-500/[0.05]'
              }`}
            >

              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFile}
                className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
              />

              <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 text-yellow-400 flex items-center justify-center mb-4">
                <UploadCloud size={27} />
              </div>

              <h3 className="text-white font-black">
                Drag & Drop Files Here
              </h3>

              <p className="text-slate-500 text-xs mt-1">
                or click anywhere in this area to browse files
              </p>

              <div className="flex flex-wrap justify-center gap-2 mt-4">

                <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] text-slate-500 text-[9px] font-bold">
                  Images
                </span>

                <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] text-slate-500 text-[9px] font-bold">
                  Videos
                </span>

                <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] text-slate-500 text-[9px] font-bold">
                  Audio
                </span>

                <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] text-slate-500 text-[9px] font-bold">
                  Documents
                </span>

              </div>

            </div>

            {/* VOICE + CAMERA BUTTONS */}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">

              {!recording ? (

                <button
                  type="button"
                  onClick={startRecording}
                  disabled={videoRecording}
                  className="h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center gap-3 font-black text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Mic size={19} />
                  Start Voice Recording
                </button>

              ) : (

                <button
                  type="button"
                  onClick={stopRecording}
                  className="h-14 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-3 font-black text-sm animate-pulse"
                >
                  <MicOff size={19} />

                  Stop Recording

                  <span className="px-2 py-1 rounded-lg bg-black/20 text-[10px]">
                    {formatRecordingTime(recordingSeconds)}
                  </span>
                </button>

              )}

              {!cameraOn ? (

                <button
                  type="button"
                  onClick={startCamera}
                  className="h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white transition-all flex items-center justify-center gap-3 font-black text-sm"
                >
                  <Camera size={19} />
                  Open Camera
                </button>

              ) : (

                <button
                  type="button"
                  onClick={stopCamera}
                  disabled={videoRecording}
                  className="h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-3 font-black text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CameraOff size={19} />
                  Close Camera
                </button>

              )}

            </div>

            {/* CAMERA PREVIEW */}

            {cameraOn && (

              <div className="mt-4 bg-[#0f172a] border border-white/10 rounded-[1.5rem] overflow-hidden">

                <div className="relative bg-black min-h-[280px] flex items-center justify-center">

                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full max-h-[500px] object-contain"
                  />

                  <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-red-500 text-white text-[9px] font-black uppercase flex items-center gap-2">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse" />

                    {videoRecording
                      ? `Recording ${formatRecordingTime(
                          videoRecordingSeconds
                        )}`
                      : 'Camera Live'}
                  </div>

                </div>

                <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">

                  <button
                    type="button"
                    onClick={capturePhoto}
                    disabled={videoRecording}
                    className="h-12 rounded-xl bg-yellow-500 text-black hover:bg-yellow-400 transition-all font-black flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Camera size={18} />
                    Capture Photo
                  </button>

                  {!videoRecording ? (

                    <button
                      type="button"
                      onClick={startVideoRecording}
                      disabled={recording}
                      className="h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-purple-500 hover:text-white transition-all font-black flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Video size={18} />
                      Record Video
                    </button>

                  ) : (

                    <button
                      type="button"
                      onClick={stopVideoRecording}
                      className="h-12 rounded-xl bg-red-500 text-white hover:bg-red-400 transition-all font-black flex items-center justify-center gap-2 animate-pulse"
                    >
                      <VideoOff size={18} />
                      Stop & Attach
                    </button>

                  )}

                  <button
                    type="button"
                    onClick={stopCamera}
                    disabled={videoRecording}
                    className="h-12 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all font-black flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <X size={18} />
                    Close
                  </button>

                </div>

              </div>

            )}

            <canvas
              ref={canvasRef}
              className="hidden"
            />

            {/* ATTACHMENT PREVIEWS */}

            {files.length > 0 && (

              <div className="mt-6">

                <div className="flex items-center justify-between mb-4">

                  <div>
                    <h3 className="text-white font-black text-sm">
                      Attachment Preview
                    </h3>

                    <p className="text-slate-500 text-[10px] mt-0.5">
                      {files.length} file
                      {files.length !== 1 ? 's' : ''}{' '}
                      attached
                    </p>
                  </div>

                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

                  {files.map((fileItem, index) => {
                    const fileType =
                      detectFileType(fileItem);

                    const fileName =
                      getFileName(fileItem, index);

                    const fileSize =
                      fileItem.file?.size
                        ? formatFileSize(
                            fileItem.file.size
                          )
                        : '';

                    return (
                      <div
                        key={
                          fileItem.preview ||
                          `${fileName}-${index}`
                        }
                        className="group relative bg-[#0f172a] border border-white/5 rounded-2xl overflow-hidden hover:border-yellow-500/30 transition-all"
                      >

                        <button
                          type="button"
                          onClick={() =>
                            removeFile(index)
                          }
                          className="absolute top-3 right-3 z-20 w-9 h-9 rounded-xl bg-red-500 text-white flex items-center justify-center shadow-xl hover:scale-110 transition-transform"
                          title="Remove attachment"
                        >
                          <Trash2 size={15} />
                        </button>

                        <div className="absolute top-3 left-3 z-20">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase backdrop-blur-xl ${
                              fileItem.isOld
                                ? 'bg-blue-500/80 text-white'
                                : 'bg-emerald-500/80 text-white'
                            }`}
                          >
                            {fileItem.isOld
                              ? 'Existing'
                              : 'New'}
                          </span>
                        </div>

                        {fileType === 'image' && (

                          <div className="h-44 bg-black/30">
                            <img
                              src={fileItem.preview}
                              alt={fileName}
                              className="w-full h-full object-cover"
                              onError={(event) => {
                                event.currentTarget.style.display =
                                  'none';
                              }}
                            />
                          </div>

                        )}

                        {fileType === 'video' && (

                          <div className="h-44 bg-black">
                            <video
                              src={fileItem.preview}
                              controls
                              playsInline
                              preload="metadata"
                              className="w-full h-full object-contain"
                            />
                          </div>

                        )}

                        {fileType === 'audio' && (

                          <div className="h-44 bg-gradient-to-br from-purple-500/10 to-blue-500/5 flex flex-col items-center justify-center p-4">

                            <div className="w-14 h-14 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-4">
                              <Volume2 size={26} />
                            </div>

                            <audio
                              src={fileItem.preview}
                              controls
                              preload="metadata"
                              className="w-full"
                            />

                          </div>

                        )}

                        {fileType === 'file' && (

                          <div className="h-44 bg-white/[0.02] flex flex-col items-center justify-center p-5">

                            <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 text-yellow-400 flex items-center justify-center">
                              <FileText size={26} />
                            </div>

                            <p className="text-slate-500 text-[10px] mt-3 uppercase font-black">
                              Document Attachment
                            </p>

                          </div>

                        )}

                        <div className="p-4">

                          <div className="flex items-center gap-3">

                            <div className="w-9 h-9 rounded-xl bg-white/[0.04] text-slate-400 flex items-center justify-center shrink-0">
                              {fileType === 'image' ? (
                                <ImageIcon size={17} />
                              ) : fileType === 'video' ? (
                                <Video size={17} />
                              ) : fileType === 'audio' ? (
                                <Volume2 size={17} />
                              ) : (
                                <File size={17} />
                              )}
                            </div>

                            <div className="min-w-0">

                              <p
                                className="text-white text-xs font-black truncate"
                                title={fileName}
                              >
                                {fileName}
                              </p>

                              <p className="text-slate-600 text-[9px] mt-0.5 uppercase">
                                {fileSize || fileType}
                              </p>

                            </div>

                          </div>

                        </div>

                      </div>
                    );
                  })}

                </div>

              </div>

            )}

          </div>

        </section>

        {/* SUBMIT SECTION */}

        <section className="bg-[#020617] border border-white/5 rounded-[2rem] p-5 md:p-7 shadow-2xl">

          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">

            <div className="flex items-start gap-3">

              <div className="w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-400 flex items-center justify-center shrink-0">
                <CheckCircle2 size={20} />
              </div>

              <div>

                <h3 className="text-white font-black text-sm">
                  Ready to{' '}
                  {isEdit
                    ? 'update'
                    : 'assign'}{' '}
                  this task?
                </h3>

                <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                  {selectedStaff.length}{' '}
                  staff member
                  {selectedStaff.length !== 1
                    ? 's'
                    : ''}{' '}
                  selected and {files.length}{' '}
                  attachment
                  {files.length !== 1 ? 's' : ''}{' '}
                  added.
                </p>

              </div>

            </div>

            <div className="flex flex-col sm:flex-row gap-3 xl:min-w-[390px]">

              <button
                type="button"
                onClick={resetForm}
                disabled={loading}
                className="h-13 px-6 py-3.5 rounded-xl bg-[#111827] border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 transition-all font-black text-xs uppercase disabled:opacity-50"
              >
                Reset Form
              </button>

              <button
                type="submit"
                disabled={
                  loading ||
                  recording ||
                  videoRecording
                }
                className="flex-1 h-13 px-7 py-3.5 rounded-xl bg-yellow-500 text-black hover:bg-yellow-400 transition-all font-black text-xs uppercase tracking-wide shadow-xl shadow-yellow-500/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {loading ? (
                  <>
                    <Loader2
                      size={18}
                      className="animate-spin"
                    />

                    {isEdit
                      ? 'Updating Task...'
                      : 'Assigning Task...'}
                  </>
                ) : (
                  <>
                    {isEdit ? (
                      <ClipboardList size={18} />
                    ) : (
                      <Send size={18} />
                    )}

                    {isEdit
                      ? 'Update Task'
                      : 'Assign Task'}
                  </>
                )}
              </button>

            </div>

          </div>

        </section>

      </form>

      {/* TOAST */}

      {toast && (

        <div
          className={`fixed bottom-5 right-5 left-5 sm:left-auto sm:min-w-[330px] sm:max-w-md z-[9999] px-5 py-4 rounded-2xl border shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5 duration-300 ${
            toast.type === 'error'
              ? 'bg-red-950/95 border-red-500/30 text-red-100'
              : 'bg-emerald-950/95 border-emerald-500/30 text-emerald-100'
          }`}
        >

          <div className="flex items-start gap-3">

            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                toast.type === 'error'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}
            >
              {toast.type === 'error' ? (
                <AlertCircle size={18} />
              ) : (
                <CheckCircle2 size={18} />
              )}
            </div>

            <div className="flex-1 min-w-0">

              <p className="text-[10px] font-black uppercase tracking-wider opacity-60">
                {toast.type === 'error'
                  ? 'Error'
                  : 'Success'}
              </p>

              <p className="text-sm font-bold mt-0.5 break-words">
                {toast.msg}
              </p>

            </div>

            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-1 opacity-50 hover:opacity-100 transition-opacity"
            >
              <X size={17} />
            </button>

          </div>

        </div>

      )}

    </div>
  );
}