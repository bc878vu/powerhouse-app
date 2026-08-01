import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useParams } from "react-router-dom";
import API from "./api";

import {
  Calendar,
  User,
  Tag,
  Activity,
  Download,
  Briefcase,
  Clock,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  ExternalLink,
  Paperclip,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ClipboardCheck,
  MessageSquareText,
  Mic,
} from "lucide-react";

// ============================================================
// API / MEDIA BASE URL
// ============================================================

const rawApiUrl =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";

const mediaBaseUrl = rawApiUrl
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");

// ============================================================
// A4 PAGINATION SETTINGS
// ============================================================

// Page 1:
// Task details + maximum 2 original task attachments.
const FIRST_PAGE_ATTACHMENT_LIMIT = 2;

// Continuation pages:
// Maximum 4 attachments per A4 page.
const NEXT_PAGE_ATTACHMENT_LIMIT = 4;

// Completion report pages:
// Maximum 4 completion media files per A4 page.
const COMPLETION_PAGE_ATTACHMENT_LIMIT = 4;

// ============================================================
// SAFE JSON PARSER
// ============================================================

function safeJsonParse(value, fallback = []) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "object") {
    return value;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn(
      "Could not parse JSON value:",
      value
    );

    return fallback;
  }
}

// ============================================================
// NORMALIZE FILE PATH
// ============================================================

function normalizePath(filePath) {
  if (!filePath) return "";

  return String(filePath)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

// ============================================================
// GET FULL MEDIA URL
// ============================================================

function getMediaUrl(media) {
  if (!media) return "";

  let filePath = "";

  if (typeof media === "string") {
    filePath = media;
  } else {
    filePath =
      media.url ||
      media.path ||
      media.file_url ||
      media.fileUrl ||
      media.filename ||
      media.fileName ||
      "";
  }

  if (!filePath) return "";

  if (
    filePath.startsWith("http://") ||
    filePath.startsWith("https://") ||
    filePath.startsWith("data:") ||
    filePath.startsWith("blob:")
  ) {
    return filePath;
  }

  const cleanPath = normalizePath(filePath);

  return `${mediaBaseUrl}/${cleanPath}`;
}

// ============================================================
// GET FILE NAME
// ============================================================

function getFileName(media, index = 0) {
  if (!media) {
    return `Attachment ${index + 1}`;
  }

  if (typeof media === "object") {
    const providedName =
      media.originalname ||
      media.originalName ||
      media.name ||
      media.filename ||
      media.fileName;

    if (providedName) {
      return providedName;
    }
  }

  const filePath =
    typeof media === "string"
      ? media
      : media.path ||
        media.url ||
        media.file_url ||
        media.fileUrl ||
        "";

  if (!filePath) {
    return `Attachment ${index + 1}`;
  }

  try {
    const cleanPath = String(filePath)
      .split("?")[0]
      .replace(/\\/g, "/");

    const lastPart =
      cleanPath.split("/").pop();

    return decodeURIComponent(
      lastPart ||
        `Attachment ${index + 1}`
    );
  } catch {
    return `Attachment ${index + 1}`;
  }
}

// ============================================================
// GET EXTENSION
// ============================================================

function getExtension(media) {
  const fileName = getFileName(media);

  const cleanName = fileName
    .split("?")[0]
    .split("#")[0];

  if (!cleanName.includes(".")) {
    return "";
  }

  return cleanName
    .split(".")
    .pop()
    .toLowerCase();
}

// ============================================================
// GET MIME TYPE
// ============================================================

function getMimeType(media) {
  if (
    !media ||
    typeof media !== "object"
  ) {
    return "";
  }

  return (
    media.type ||
    media.mimetype ||
    media.mimeType ||
    media.file_type ||
    ""
  )
    .toString()
    .toLowerCase();
}

// ============================================================
// DETECT FILE CATEGORY
// ============================================================

function getFileCategory(media) {
  const mimeType = getMimeType(media);
  const extension = getExtension(media);

  const imageExtensions = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "bmp",
    "svg",
    "avif",
  ];

  const videoExtensions = [
    "mp4",
    "mov",
    "avi",
    "mkv",
    "m4v",
    "3gp",
  ];

  const audioExtensions = [
    "mp3",
    "wav",
    "ogg",
    "m4a",
    "aac",
    "flac",
    "webm",
  ];

  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  if (imageExtensions.includes(extension)) {
    return "image";
  }

  if (videoExtensions.includes(extension)) {
    return "video";
  }

  if (audioExtensions.includes(extension)) {
    return "audio";
  }

  return "document";
}

// ============================================================
// NORMALIZE ONE ATTACHMENT
// ============================================================

function normalizeAttachment(
  media,
  index = 0
) {
  if (!media) return null;

  if (typeof media === "string") {
    return {
      path: normalizePath(media),
      name: getFileName(media, index),
      type: "",
      originalData: media,
    };
  }

  if (typeof media === "object") {
    const pathValue =
      media.path ||
      media.url ||
      media.file_url ||
      media.fileUrl ||
      media.filename ||
      "";

    if (!pathValue) {
      return null;
    }

    return {
      ...media,

      path: normalizePath(pathValue),

      name:
        media.originalname ||
        media.originalName ||
        media.name ||
        media.fileName ||
        getFileName(media, index),

      type:
        media.type ||
        media.mimetype ||
        media.mimeType ||
        media.file_type ||
        "",

      originalData: media,
    };
  }

  return null;
}

// ============================================================
// EXTRACT FILES FROM ANY SOURCE
// ============================================================

function extractFilesFromSources(sources = []) {
  let allFiles = [];

  sources.forEach((source) => {
    if (!source) return;

    let parsed = source;

    if (typeof source === "string") {
      parsed = safeJsonParse(
        source,
        source
      );
    }

    if (Array.isArray(parsed)) {
      allFiles.push(...parsed);
      return;
    }

    if (
      typeof parsed === "string" &&
      parsed.trim()
    ) {
      allFiles.push(parsed);
      return;
    }

    if (
      parsed &&
      typeof parsed === "object"
    ) {
      allFiles.push(parsed);
    }
  });

  const normalizedFiles = allFiles
    .map((media, index) =>
      normalizeAttachment(media, index)
    )
    .filter(Boolean);

  const uniqueFiles = [];
  const seen = new Set();

  normalizedFiles.forEach((file) => {
    const uniqueKey =
      file.path ||
      file.url ||
      file.name ||
      JSON.stringify(file);

    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      uniqueFiles.push(file);
    }
  });

  return uniqueFiles;
}

// ============================================================
// EXTRACT ORIGINAL TASK ATTACHMENTS
// ============================================================

function extractAttachments(task) {
  if (!task) return [];

  return extractFilesFromSources([
    task.media,
    task.file_url,
    task.fileUrl,
    task.files,
    task.attachments,
  ]);
}

// ============================================================
// NORMALIZE ONE COMPLETION REPORT
// ============================================================

function normalizeCompletionReport(
  report,
  index = 0
) {
  if (!report || typeof report !== "object") {
    return null;
  }

  const mediaFiles = extractFilesFromSources([
    report.media_files,
    report.media,
    report.attachments,
    report.files,
  ]);

  const voiceNotes = extractFilesFromSources([
    report.voice_notes,
    report.voice_note,
  ]);

  return {
    ...report,

    id:
      report.id ||
      `completion-${index + 1}`,

    completion_note:
      report.completion_note ||
      report.note ||
      "",

    media_files: mediaFiles,

    voice_notes: voiceNotes,

    submitted_by:
      report.submitted_by || {
        id: report.user_id || null,
        name:
          report.completion_user_name ||
          report.staff_name ||
          "Unknown User",
        email:
          report.completion_user_email ||
          null,
        role:
          report.completion_user_role ||
          null,
      },
  };
}

// ============================================================
// EXTRACT ALL COMPLETION REPORTS
// ============================================================

function extractCompletionReports(task) {
  if (!task) return [];

  let reports = [];

  if (
    Array.isArray(task.completion_reports)
  ) {
    reports = task.completion_reports;
  } else if (task.completion_reports) {
    const parsed = safeJsonParse(
      task.completion_reports,
      []
    );

    if (Array.isArray(parsed)) {
      reports = parsed;
    }
  }

  if (
    reports.length === 0 &&
    task.latest_completion
  ) {
    reports = [task.latest_completion];
  }

  return reports
    .map((report, index) =>
      normalizeCompletionReport(
        report,
        index
      )
    )
    .filter(Boolean);
}

// ============================================================
// ASSIGNED USERS
// ============================================================

function getAssignedUsers(task) {
  if (
    Array.isArray(task?.assigned_users) &&
    task.assigned_users.length > 0
  ) {
    return task.assigned_users;
  }

  if (
    task?.user_id ||
    task?.staff_name
  ) {
    return [
      {
        user_id: task.user_id || "",
        name:
          task.staff_name ||
          "Unassigned",
      },
    ];
  }

  return [];
}

// ============================================================
// SPLIT ARRAY INTO CHUNKS
// ============================================================

function chunkArray(items, chunkSize) {
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    !Number.isFinite(chunkSize) ||
    chunkSize <= 0
  ) {
    return [];
  }

  const chunks = [];

  for (
    let i = 0;
    i < items.length;
    i += chunkSize
  ) {
    const chunk = items.slice(
      i,
      i + chunkSize
    );

    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

// ============================================================
// FORMAT DATE / TIME
// ============================================================

function formatDateTime(value) {
  if (!value) {
    return {
      date: "N/A",
      time: "",
    };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      date: "N/A",
      time: "",
    };
  }

  return {
    date: date.toLocaleDateString(
      "en-GB"
    ),

    time: date.toLocaleTimeString(),
  };
}

// ============================================================
// ATTACHMENT CARD
// ============================================================

function AttachmentCard({
  media,
  index,
}) {
  const url = getMediaUrl(media);
  const category = getFileCategory(media);
  const fileName = getFileName(media, index);

  const [loadError, setLoadError] =
    useState(false);

  const [
    videoThumbnail,
    setVideoThumbnail,
  ] = useState("");

  const captureVideoThumbnail = (video) => {
    if (
      !video ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      return;
    }

    try {
      const canvas =
        document.createElement("canvas");

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context =
        canvas.getContext("2d");

      if (!context) return;

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const thumbnail =
        canvas.toDataURL(
          "image/jpeg",
          0.9
        );

      setVideoThumbnail(thumbnail);
    } catch (error) {
      console.warn(
        "Could not capture video thumbnail:",
        error
      );
    }
  };

  const handleVideoLoadedMetadata = (
    event
  ) => {
    const video = event.currentTarget;

    const targetTime =
      Number.isFinite(video.duration) &&
      video.duration > 1
        ? Math.min(
            1,
            video.duration / 4
          )
        : 0.1;

    try {
      video.currentTime = targetTime;
    } catch (error) {
      console.warn(
        "Could not seek video:",
        error
      );

      captureVideoThumbnail(video);
    }
  };

  const handleVideoSeeked = (event) => {
    captureVideoThumbnail(
      event.currentTarget
    );
  };

  return (
    <div
      className={`attachment-card attachment-${category}-card`}
    >
      {category === "image" &&
        !loadError && (
          <div className="attachment-preview image-preview">
            <img
              src={url}
              alt={fileName}
              className="attachment-image"
              onError={() =>
                setLoadError(true)
              }
            />
          </div>
        )}

      {category === "video" &&
        !loadError && (
          <div className="attachment-preview video-preview">
            <video
              src={url}
              controls
              preload="auto"
              playsInline
              crossOrigin="anonymous"
              className="attachment-video"
              onLoadedMetadata={
                handleVideoLoadedMetadata
              }
              onSeeked={
                handleVideoSeeked
              }
              onLoadedData={(event) => {
                const video =
                  event.currentTarget;

                if (
                  !videoThumbnail &&
                  video.currentTime > 0
                ) {
                  captureVideoThumbnail(
                    video
                  );
                }
              }}
              onError={() =>
                setLoadError(true)
              }
            >
              Your browser does not
              support video playback.
            </video>

            {videoThumbnail ? (
              <div className="print-video-thumbnail">
                <img
                  src={videoThumbnail}
                  alt={`${fileName} video thumbnail`}
                  className="print-video-thumbnail-image"
                />

                <div className="print-video-badge">
                  <Video size={12} />
                  Video Attachment
                </div>
              </div>
            ) : (
              <div className="print-video-placeholder">
                <Video size={34} />
                <span>
                  Video Attachment
                </span>
              </div>
            )}
          </div>
        )}

      {category === "audio" &&
        !loadError && (
          <div className="attachment-preview audio-preview">
            <Music
              size={38}
              className="text-yellow-600 audio-icon"
            />

            <audio
              src={url}
              controls
              preload="metadata"
              className="attachment-audio"
              onError={() =>
                setLoadError(true)
              }
            >
              Your browser does not
              support audio playback.
            </audio>

            <span className="print-audio-label">
              Audio Attachment
            </span>
          </div>
        )}

      {category === "document" &&
        !loadError && (
          <div className="attachment-preview document-preview">
            <FileText
              size={38}
              className="text-yellow-600"
            />

            <p className="document-file-name">
              {fileName}
            </p>

            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="document-open-button no-print"
            >
              <ExternalLink size={13} />
              Open File
            </a>
          </div>
        )}

      {loadError && (
        <div className="attachment-preview error-preview">
          <AlertCircle
            size={34}
            className="text-red-500"
          />

          <p className="error-title">
            Failed to load attachment
          </p>

          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="error-open-button no-print"
          >
            <ExternalLink size={13} />
            Try Opening File
          </a>
        </div>
      )}

      <div className="attachment-file-footer">
        <div className="attachment-file-name-wrap">
          {category === "image" && (
            <ImageIcon
              size={14}
              className="text-yellow-600 shrink-0"
            />
          )}

          {category === "video" && (
            <Video
              size={14}
              className="text-yellow-600 shrink-0"
            />
          )}

          {category === "audio" && (
            <Music
              size={14}
              className="text-yellow-600 shrink-0"
            />
          )}

          {category === "document" && (
            <FileText
              size={14}
              className="text-yellow-600 shrink-0"
            />
          )}

          <p
            className="attachment-file-name"
            title={fileName}
          >
            {fileName}
          </p>
        </div>

        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="no-print attachment-open-link"
          title="Open attachment"
        >
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}

// ============================================================
// REPORT HEADER
// ============================================================

function ReportHeader({ taskId }) {
  return (
    <header className="report-header">
      <div className="report-header-inner">
        <div>
          <h1 className="report-logo">
            POWER
            <span>HOUSE</span>
          </h1>

          <p className="report-subtitle">
            OPERATIONAL DOCUMENTATION SYSTEM
          </p>
        </div>

        <div className="report-token">
          <p>System Token</p>
          <h2>#{taskId}</h2>
        </div>
      </div>
    </header>
  );
}

// ============================================================
// REPORT FOOTER
// ============================================================

function ReportFooter({
  pageNumber,
  totalPages,
}) {
  return (
    <footer className="report-footer">
      <div className="report-footer-main">
        <div className="footer-admin">
          <div className="footer-ph-box">
            PH
          </div>

          <div>
            <p className="footer-admin-title">
              System Admin
            </p>

            <p className="footer-admin-subtitle">
              Verified Content
            </p>
          </div>
        </div>

        <div className="footer-approval">
          <p>
            Digital Stamp / Approval Authority
          </p>

          <div className="footer-signature-line" />
        </div>
      </div>

      <div className="report-footer-bottom">
        <div className="report-copyright">
          Copyright 2026 PowerHouse Management v1.2
          Confidential Document
        </div>

        <div className="report-page-number">
          Page {pageNumber} of {totalPages}
        </div>
      </div>
    </footer>
  );
}

// ============================================================
// TASK INFORMATION
// ============================================================

function TaskInformation({
  task,
  assignedUsers,
  createdDate,
  validCreatedDate,
}) {
  const hasCompletionReport =
    task.has_completion_report ||
    (
      Array.isArray(
        task.completion_reports
      ) &&
      task.completion_reports.length > 0
    ) ||
    Boolean(task.latest_completion);

  return (
    <div className="first-page-details">
      <div className="task-information-grid">
        <div>
          <p className="task-label">
            <Tag size={12} />
            Subject
          </p>

          <h3 className="task-value capitalize">
            {task.title || "N/A"}
          </h3>
        </div>

        <div>
          <p className="task-label">
            <Activity size={12} />
            Task Status
          </p>

          <h3
            className={`task-value uppercase status-value status-${String(
              task.status || "Pending"
            )
              .toLowerCase()
              .replace(/\s+/g, "-")}`}
          >
            {task.status || "PENDING"}
          </h3>
        </div>

        <div>
          <p className="task-label">
            <ClipboardCheck size={12} />
            Complete Work Status
          </p>

          <h3
            className={`task-value uppercase completion-status-value ${
              hasCompletionReport
                ? "completion-status-completed"
                : "completion-status-pending"
            }`}
          >
            {hasCompletionReport
              ? "COMPLETED"
              : "NOT SUBMITTED"}
          </h3>
        </div>

        <div>
          <p className="task-label">
            <Briefcase size={12} />
            Department
          </p>

          <h3 className="task-value">
            {task.category || "General"}
          </h3>
        </div>

        <div>
          <p className="task-label">
            <User size={12} />
            Assigned To
          </p>

          {assignedUsers.length > 0 ? (
            assignedUsers.map(
              (assignedUser, index) => (
                <div
                  key={`${
                    assignedUser.user_id ||
                    index
                  }-${index}`}
                  className="assigned-user"
                >
                  <h3 className="task-value uppercase">
                    {assignedUser.name ||
                      "Unassigned"}
                  </h3>

                  <p className="task-small-text">
                    UID:{" "}
                    {assignedUser.user_id ||
                      "0"}
                  </p>
                </div>
              )
            )
          ) : (
            <h3 className="task-value uppercase">
              Unassigned
            </h3>
          )}
        </div>

        <div>
          <p className="task-label">
            <Calendar size={12} />
            Registry Date
          </p>

          <h3 className="task-value">
            {validCreatedDate
              ? createdDate.toLocaleDateString(
                  "en-GB"
                )
              : "N/A"}
          </h3>

          <p className="task-small-text italic">
            {validCreatedDate
              ? createdDate.toLocaleTimeString()
              : ""}
          </p>
        </div>

        <div>
          <p className="task-label">
            <Clock size={12} />
            Priority
          </p>

          <h3 className="task-value priority-value">
            {task.priority || "NORMAL"}
          </h3>
        </div>
      </div>

      <div className="description-section">
        <h4 className="description-heading">
          Description:
        </h4>

        <div className="description-box">
          <div className="description-content">
            {task.description ||
              "No operational intelligence provided."}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COMPLETION INFORMATION
// ============================================================

function CompletionInformation({
  completion,
  reportNumber,
  totalReports,
}) {
  const submittedDate = formatDateTime(
    completion.submitted_at ||
    completion.updated_at
  );

  const submittedBy =
    completion.submitted_by || {};

  return (
    <div className="completion-information">
      <div className="completion-banner">
        <div className="completion-banner-icon">
          <CheckCircle2 size={18} />
        </div>

        <div>
          <p className="completion-banner-label">
            Complete Work Status
          </p>

          <h2 className="completion-banner-title">
            COMPLETED
          </h2>
        </div>

        <div className="completion-report-number">
          Report {reportNumber} of{" "}
          {totalReports}
        </div>
      </div>

      <div className="completion-information-grid">
        <div>
          <p className="task-label">
            <User size={12} />
            Completed By
          </p>

          <h3 className="task-value uppercase">
            {submittedBy.name ||
              "Unknown User"}
          </h3>

          <p className="task-small-text">
            UID:{" "}
            {submittedBy.id ||
              completion.user_id ||
              "N/A"}
          </p>
        </div>

        <div>
          <p className="task-label">
            <Calendar size={12} />
            Completion Date
          </p>

          <h3 className="task-value">
            {submittedDate.date}
          </h3>

          <p className="task-small-text italic">
            {submittedDate.time}
          </p>
        </div>

        <div>
          <p className="task-label">
            <Activity size={12} />
            Work Status
          </p>

          <h3 className="completion-status-completed task-value uppercase">
            COMPLETED
          </h3>
        </div>
      </div>

      <div className="completion-note-section">
        <h4 className="completion-section-heading">
          <MessageSquareText size={14} />
          Completion Note
        </h4>

        <div className="completion-note-box">
          <div className="description-content">
            {completion.completion_note ||
              "No completion note provided."}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ATTACHMENTS SECTION
// ============================================================

function AttachmentsSection({
  attachments,
  startIndex = 0,
  showTotalBadge = true,
  totalAttachments = 0,
  taskId,
  title = "Attached Files",
  emptyText = "No Visual Assets Attached",
  iconType = "paperclip",
}) {
  const safeAttachments =
    Array.isArray(attachments)
      ? attachments.filter(Boolean)
      : [];

  const attachmentCount =
    safeAttachments.length;

  return (
    <div
      className={`attachments-section attachments-count-${attachmentCount}`}
    >
      <div className="attachments-title-row">
        <h4>
          {iconType === "mic" ? (
            <Mic size={14} />
          ) : (
            <Paperclip size={14} />
          )}

          {title}
        </h4>

        {showTotalBadge &&
          totalAttachments > 0 && (
            <span className="attachment-count">
              {totalAttachments}{" "}
              {totalAttachments === 1
                ? "File"
                : "Files"}
            </span>
          )}
      </div>

      {safeAttachments.length > 0 ? (
        <div
          className={`attachments-grid grid-count-${Math.min(
            attachmentCount,
            4
          )}`}
        >
          {safeAttachments.map(
            (media, localIndex) => {
              const realIndex =
                startIndex + localIndex;

              return (
                <AttachmentCard
                  key={
                    media.path ||
                    media.name ||
                    realIndex
                  }
                  media={media}
                  index={realIndex}
                />
              );
            }
          )}
        </div>
      ) : (
        <div className="empty-attachments">
          <Paperclip size={30} />

          <p>{emptyText}</p>

          <small>
            Task ID: #{taskId}
          </small>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN TASK VIEW COMPONENT
// ============================================================

export default function TaskView() {
  const { id } = useParams();

  const [task, setTask] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  // ==========================================================
  // FETCH TASK
  // ==========================================================

  const fetchTask = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await API.get(
        `/task/${id}`
      );

      const fetchedTask =
        response.data?.task ||
        response.data;

      if (
        !fetchedTask ||
        !fetchedTask.id
      ) {
        throw new Error(
          `Task #${id} was not found.`
        );
      }

      setTask(fetchedTask);
    } catch (err) {
      console.error(
        "TASK FETCH ERROR:",
        err
      );

      setError(
        err.response?.data?.msg ||
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        "Failed to load task."
      );

      setTask(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTask();
  }, [id]);

  // ==========================================================
  // PRINT CLEANUP
  // ==========================================================

  useEffect(() => {
    const cleanupAfterPrint = () => {
      document.body.classList.remove(
        "printing-full-report"
      );

      document.documentElement.classList.remove(
        "printing-full-report-html"
      );
    };

    window.addEventListener(
      "afterprint",
      cleanupAfterPrint
    );

    return () => {
      window.removeEventListener(
        "afterprint",
        cleanupAfterPrint
      );

      cleanupAfterPrint();
    };
  }, []);

  const assignedUsers = useMemo(() => {
    return getAssignedUsers(task);
  }, [task]);

  const attachments = useMemo(() => {
    return extractAttachments(task);
  }, [task]);

  const completionReports = useMemo(() => {
    return extractCompletionReports(task);
  }, [task]);

  // ==========================================================
  // ORIGINAL TASK PAGES
  // ==========================================================

  const taskPages = useMemo(() => {
    const cleanAttachments =
      Array.isArray(attachments)
        ? attachments.filter(Boolean)
        : [];

    const firstPageAttachments =
      cleanAttachments.slice(
        0,
        FIRST_PAGE_ATTACHMENT_LIMIT
      );

    const remainingAttachments =
      cleanAttachments.slice(
        FIRST_PAGE_ATTACHMENT_LIMIT
      );

    const continuationPages =
      chunkArray(
        remainingAttachments,
        NEXT_PAGE_ATTACHMENT_LIMIT
      ).filter(
        (page) =>
          Array.isArray(page) &&
          page.length > 0
      );

    return {
      firstPageAttachments,
      continuationPages,
    };
  }, [attachments]);

  // ==========================================================
  // COMPLETION REPORT PAGES
  // ==========================================================

  const completionPages = useMemo(() => {
    const pages = [];

    completionReports.forEach(
      (completion, reportIndex) => {
        const allCompletionFiles = [
          ...(completion.media_files || []),
          ...(completion.voice_notes || []),
        ];

        const firstCompletionFiles =
          allCompletionFiles.slice(
            0,
            COMPLETION_PAGE_ATTACHMENT_LIMIT
          );

        pages.push({
          type: "completion-first",
          completion,
          reportIndex,
          attachments:
            firstCompletionFiles,
          startIndex: 0,
        });

        const remainingFiles =
          allCompletionFiles.slice(
            COMPLETION_PAGE_ATTACHMENT_LIMIT
          );

        const continuationChunks =
          chunkArray(
            remainingFiles,
            COMPLETION_PAGE_ATTACHMENT_LIMIT
          );

        continuationChunks.forEach(
          (chunk, chunkIndex) => {
            pages.push({
              type:
                "completion-continuation",
              completion,
              reportIndex,
              attachments: chunk,
              startIndex:
                COMPLETION_PAGE_ATTACHMENT_LIMIT +
                chunkIndex *
                  COMPLETION_PAGE_ATTACHMENT_LIMIT,
            });
          }
        );
      }
    );

    return pages;
  }, [completionReports]);

  // ==========================================================
  // TOTAL PAGES
  // ==========================================================

  const totalPages = useMemo(() => {
    return (
      1 +
      taskPages.continuationPages.length +
      completionPages.length
    );
  }, [
    taskPages.continuationPages.length,
    completionPages.length,
  ]);

  // ==========================================================
  // PRINT COMPLETE REPORT
  // ==========================================================

  const handlePrint = async () => {
    document.body.classList.add(
      "printing-full-report"
    );

    document.documentElement.classList.add(
      "printing-full-report-html"
    );

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    });

    const images = Array.from(
      document.querySelectorAll(
        ".report-pages-container img"
      )
    );

    const imagePromises = images.map(
      (image) => {
        if (
          image.complete &&
          image.naturalWidth > 0
        ) {
          return Promise.resolve();
        }

        return new Promise((resolve) => {
          let finished = false;

          const finish = () => {
            if (finished) return;

            finished = true;
            resolve();
          };

          image.addEventListener(
            "load",
            finish,
            { once: true }
          );

          image.addEventListener(
            "error",
            finish,
            { once: true }
          );

          setTimeout(finish, 3000);
        });
      }
    );

    await Promise.all(imagePromises);

    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    } catch (fontError) {
      console.warn(
        "Could not wait for fonts:",
        fontError
      );
    }

    setTimeout(() => {
      window.print();
    }, 1000);
  };

  // ==========================================================
  // LOADING
  // ==========================================================

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0f1e]">
        <div className="text-center">
          <RefreshCw
            size={32}
            className="
              text-yellow-500
              animate-spin
              mx-auto
              mb-4
            "
          />

          <div
            className="
              text-yellow-500
              font-black
              animate-pulse
              tracking-widest
              uppercase
              italic
            "
          >
            Loading Task Report...
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================
  // ERROR
  // ==========================================================

  if (error || !task) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0f1e] p-6">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/20 rounded-2xl p-8 text-center">
          <AlertCircle
            size={42}
            className="text-red-500 mx-auto mb-4"
          />

          <h2 className="text-white text-xl font-black mb-2">
            Unable to Load Task
          </h2>

          <p className="text-slate-400 text-sm mb-6">
            {error ||
              `Task #${id} was not found.`}
          </p>

          <button
            onClick={fetchTask}
            className="
              inline-flex
              items-center
              justify-center
              gap-2
              px-5
              py-3
              bg-yellow-500
              text-black
              rounded-xl
              font-black
              text-xs
              uppercase
            "
          >
            <RefreshCw size={15} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const createdDate =
    task.created_at
      ? new Date(task.created_at)
      : null;

  const validCreatedDate =
    createdDate &&
    !Number.isNaN(
      createdDate.getTime()
    );

  let currentPageNumber = 1;

  return (
    <div className="task-view-screen">
      <style>{`

        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }

        .task-view-screen {
          width: 100%;
          min-height: 100vh;
          padding: 32px 20px 80px;
          background: #1e293b;
          overflow-x: auto;
        }

        .report-pages-container {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
        }

        .a4-report-page {
          position: relative;
          width: 210mm;
          min-width: 210mm;
          max-width: 210mm;
          height: 296.5mm;
          min-height: 296.5mm;
          max-height: 296.5mm;

          padding:
            14mm
            13mm
            25mm
            13mm;

          flex-shrink: 0;
          background: #ffffff;
          color: #0f172a;
          border: 0;

          box-shadow:
            inset 0 2mm 0 #eab308,
            0 20px 50px rgba(0, 0, 0, 0.35);

          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .report-header {
          flex: 0 0 auto;
          margin: 0 0 7mm 0;
          padding: 0 0 5mm 0;
          border-bottom: 2px solid #f1f5f9;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .report-header-inner {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
        }

        .report-logo {
          margin: 0;
          color: #000000;
          font-size: 24px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -0.05em;
          text-transform: uppercase;
        }

        .report-logo span {
          color: #ca8a04;
        }

        .report-subtitle {
          margin-top: 4px;
          color: #94a3b8;
          font-size: 7px;
          font-weight: 700;
          letter-spacing: 0.4em;
          text-transform: uppercase;
        }

        .report-token {
          text-align: right;
        }

        .report-token p {
          margin: 0;
          color: #cbd5e1;
          font-size: 7px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .report-token h2 {
          margin: 0;
          color: #000000;
          font-size: 22px;
          line-height: 1;
          font-weight: 900;
        }

        .report-page-content {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .first-page-details {
          flex: 0 0 auto;
        }

        .task-information-grid,
        .completion-information-grid {
          display: grid;
          grid-template-columns:
            repeat(3, minmax(0, 1fr));
          gap: 6mm 8mm;
          margin-bottom: 7mm;
        }

        .task-label {
          display: flex;
          align-items: center;
          gap: 5px;
          margin: 0 0 3px 0;
          color: #94a3b8;
          font-size: 7px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .task-label svg {
          color: #ca8a04;
        }

        .task-value {
          margin: 0;
          color: #1e293b;
          font-size: 9px;
          font-weight: 700;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .task-small-text {
          margin: 2px 0 0 0;
          color: #94a3b8;
          font-size: 6px;
          font-weight: 700;
        }

        .uppercase {
          text-transform: uppercase;
        }

        .capitalize {
          text-transform: capitalize;
        }

        .italic {
          font-style: italic;
        }

        .priority-value {
          color: #dc2626;
          font-weight: 900;
          font-style: italic;
          text-transform: uppercase;
        }

        .assigned-user {
          margin-bottom: 3px;
        }

        .completion-status-value {
          font-weight: 900;
        }

        .completion-status-completed {
          color: #16a34a !important;
          font-weight: 900 !important;
        }

        .completion-status-pending {
          color: #d97706 !important;
          font-weight: 900 !important;
        }

        .description-section {
          flex: 0 0 auto;
          margin-bottom: 7mm;
        }

        .description-heading {
          margin: 0 0 3mm 0;
          color: #000000;
          font-size: 12px;
          font-weight: 900;
        }

        .description-box,
        .completion-note-box {
          width: 100%;
          min-height: 24mm;
          height: auto;
          padding: 4mm;
          border: 2px solid #f1f5f9;
          border-radius: 2mm;
          background: #f8fafc;
          overflow: visible;
        }

        .description-content {
          width: 100%;
          color: #475569;
          font-size: 8px;
          line-height: 1.45;
          white-space: pre-wrap;
          overflow: visible;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        /* COMPLETION REPORT */

        .completion-information {
          flex: 0 0 auto;
        }

        .completion-banner {
          display: flex;
          align-items: center;
          gap: 3mm;
          margin-bottom: 7mm;
          padding: 4mm;
          border: 1px solid #bbf7d0;
          border-radius: 2mm;
          background: #f0fdf4;
        }

        .completion-banner-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 10mm;
          height: 10mm;
          flex-shrink: 0;
          border-radius: 50%;
          background: #16a34a;
          color: #ffffff;
        }

        .completion-banner-label {
          margin: 0 0 1mm 0;
          color: #64748b;
          font-size: 6px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }

        .completion-banner-title {
          margin: 0;
          color: #16a34a;
          font-size: 14px;
          line-height: 1;
          font-weight: 900;
        }

        .completion-report-number {
          margin-left: auto;
          padding: 1.5mm 3mm;
          border-radius: 999px;
          background: #dcfce7;
          color: #15803d;
          font-size: 6px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .completion-note-section {
          margin-bottom: 7mm;
        }

        .completion-section-heading {
          display: flex;
          align-items: center;
          gap: 2mm;
          margin: 0 0 3mm 0;
          color: #000000;
          font-size: 10px;
          font-weight: 900;
        }

        .completion-section-heading svg {
          color: #16a34a;
        }

        .attachments-section {
          width: 100%;
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          min-height: 0;
        }

        .attachments-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex: 0 0 auto;
          gap: 4mm;
          margin-bottom: 3mm;
        }

        .attachments-title-row h4 {
          display: flex;
          align-items: center;
          gap: 5px;
          margin: 0;
          color: #000000;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }

        .attachments-title-row h4 svg {
          color: #ca8a04;
        }

        .attachment-count {
          padding: 1mm 2.5mm;
          border-radius: 999px;
          background: #fef9c3;
          color: #a16207;
          font-size: 6px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .attachments-grid {
          width: 100%;
          display: grid;
          flex: 1 1 auto;
          min-height: 0;
          gap: 4mm;
          align-items: stretch;
        }

        .attachments-grid.grid-count-1 {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: minmax(0, 1fr);
        }

        .attachments-grid.grid-count-2 {
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          grid-template-rows: minmax(0, 1fr);
        }

        .attachments-grid.grid-count-3,
        .attachments-grid.grid-count-4 {
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          grid-template-rows:
            repeat(2, minmax(0, 1fr));
        }

        .attachment-card {
          width: 100%;
          height: 100%;
          min-height: 0;
          overflow: hidden;
          border: 1px solid #f1f5f9;
          border-radius: 2mm;
          background: #ffffff;
          box-shadow:
            0 1px 3px
            rgba(15, 23, 42, 0.08);
          display: flex;
          flex-direction: column;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .attachment-preview {
          position: relative;
          width: 100%;
          flex: 1 1 auto;
          min-height: 31mm;
          overflow: hidden;
        }

        .image-preview {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2mm;
          background: #f8fafc;
        }

        .attachment-image {
          display: block;
          width: 100%;
          height: 100%;
          max-width: 100%;
          max-height: 100%;
          margin: 0 auto;
          object-fit: contain;
        }

        .video-preview {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000000;
        }

        .attachment-video {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: #000000;
        }

        .print-video-thumbnail {
          display: none;
        }

        .print-video-thumbnail-image {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .print-video-badge {
          position: absolute;
          left: 3mm;
          bottom: 3mm;
          display: flex;
          align-items: center;
          gap: 1.5mm;
          padding: 1.5mm 2.5mm;
          border-radius: 999px;
          background:
            rgba(15, 23, 42, 0.88);
          color: #ffffff;
          font-size: 6px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .print-video-placeholder {
          display: none;
        }

        .audio-preview,
        .document-preview,
        .error-preview {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2mm;
          padding: 2mm;
          text-align: center;
          background: #f8fafc;
        }

        .attachment-audio {
          width: 90%;
          height: 30px;
        }

        .print-audio-label {
          display: none;
        }

        .document-file-name {
          max-width: 100%;
          margin: 0;
          color: #334155;
          font-size: 7px;
          font-weight: 900;
          overflow-wrap: anywhere;
        }

        .document-open-button,
        .error-open-button {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 9px;
          border-radius: 5px;
          background: #eab308;
          color: #000000;
          font-size: 7px;
          font-weight: 900;
          text-decoration: none;
          text-transform: uppercase;
        }

        .error-title {
          margin: 0;
          color: #dc2626;
          font-size: 8px;
          font-weight: 900;
        }

        .attachment-file-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex: 0 0 10mm;
          gap: 6px;
          height: 10mm;
          min-height: 10mm;
          padding: 2mm 2.5mm;
          border-top: 1px solid #f1f5f9;
        }

        .attachment-file-name-wrap {
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
        }

        .attachment-file-name {
          min-width: 0;
          margin: 0;
          overflow: hidden;
          color: #475569;
          font-size: 6px;
          font-weight: 900;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .attachment-open-link {
          flex-shrink: 0;
          color: #ca8a04;
        }

        .empty-attachments {
          padding: 12mm 4mm;
          border: 2px dashed #e2e8f0;
          border-radius: 2mm;
          text-align: center;
        }

        .empty-attachments svg {
          margin: 0 auto 5px;
          color: #e2e8f0;
        }

        .empty-attachments p {
          margin: 0;
          color: #cbd5e1;
          font-size: 8px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .empty-attachments small {
          display: block;
          margin-top: 4px;
          color: #cbd5e1;
          font-size: 6px;
        }

        .report-footer {
          position: absolute;
          left: 13mm;
          right: 13mm;
          bottom: 7mm;
          height: 14mm;
          background: #ffffff;
        }

        .report-footer-main {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          height: 9mm;
          padding-top: 2mm;
          border-top: 2px solid #f8fafc;
        }

        .footer-admin {
          display: flex;
          align-items: center;
          gap: 3mm;
        }

        .footer-ph-box {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 8mm;
          height: 8mm;
          border-radius: 2mm;
          background: #0f172a;
          color: #ffffff;
          font-size: 7px;
          font-weight: 900;
          font-style: italic;
        }

        .footer-admin-title {
          margin: 0;
          color: #000000;
          font-size: 7px;
          line-height: 1;
          font-weight: 900;
          text-transform: uppercase;
        }

        .footer-admin-subtitle {
          margin: 2px 0 0 0;
          color: #94a3b8;
          font-size: 5px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .footer-approval {
          text-align: right;
        }

        .footer-approval p {
          margin: 0 0 2mm 0;
          color: #94a3b8;
          font-size: 5px;
          font-weight: 900;
          font-style: italic;
          text-transform: uppercase;
        }

        .footer-signature-line {
          width: 40mm;
          height: 0.3mm;
          margin-left: auto;
          background: #e2e8f0;
        }

        .report-footer-bottom {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 2mm;
        }

        .report-copyright {
          color: #94a3b8;
          font-size: 5px;
          font-weight: 900;
          text-align: center;
          text-transform: uppercase;
          letter-spacing: 0.35em;
        }

        .report-page-number {
          position: absolute;
          right: 0;
          color: #64748b;
          font-size: 6px;
          font-weight: 900;
          text-transform: uppercase;
        }

        @media screen and (max-width: 850px) {
          .task-view-screen {
            padding-left: 10px;
            padding-right: 10px;
          }

          .report-pages-container {
            align-items: flex-start;
          }
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }

          *,
          *::before,
          *::after {
            box-sizing: border-box !important;
            -webkit-print-color-adjust:
              exact !important;
            print-color-adjust:
              exact !important;
          }

          html,
          body,
          #root {
            width: 210mm !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }

          html.printing-full-report-html,
          body.printing-full-report {
            position: static !important;
            width: 210mm !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
          }

          body.printing-full-report * {
            visibility: hidden !important;
          }

          body.printing-full-report
          .report-pages-container,
          body.printing-full-report
          .report-pages-container * {
            visibility: visible !important;
          }

          body.printing-full-report nav,
          body.printing-full-report aside,
          body.printing-full-report
          header:not(.report-header),
          body.printing-full-report .sidebar,
          body.printing-full-report .navbar,
          body.printing-full-report .mobile-header,
          body.printing-full-report .top-header,
          body.printing-full-report .app-header,
          body.printing-full-report .layout-header,
          body.printing-full-report .main-header,
          body.printing-full-report .dashboard-header,
          .no-print {
            display: none !important;
          }

          body.printing-full-report #root,
          body.printing-full-report #root > div,
          body.printing-full-report main,
          body.printing-full-report
          .task-view-screen,
          body.printing-full-report
          .report-pages-container {
            position: static !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            transform: none !important;
          }

          body.printing-full-report
          .task-view-screen,
          body.printing-full-report
          .report-pages-container {
            display: block !important;
            width: 210mm !important;
            min-width: 210mm !important;
            max-width: 210mm !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }

          body.printing-full-report
          .a4-report-page {
            position: relative !important;
            display: flex !important;
            flex-direction: column !important;
            box-sizing: border-box !important;

            width: 210mm !important;
            min-width: 210mm !important;
            max-width: 210mm !important;

            height: 296.5mm !important;
            min-height: 296.5mm !important;
            max-height: 296.5mm !important;

            margin: 0 !important;

            padding:
              14mm
              13mm
              25mm
              13mm !important;

            border: 0 !important;

            box-shadow:
              inset 0 2mm 0 #eab308 !important;

            background: #ffffff !important;
            color: #0f172a !important;

            overflow: hidden !important;

            page-break-inside:
              avoid !important;

            break-inside:
              avoid-page !important;

            page-break-after:
              page !important;

            break-after:
              page !important;
          }

          body.printing-full-report
          .a4-report-page:last-child {
            page-break-after:
              auto !important;

            break-after:
              auto !important;
          }

          .report-page-content {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
          }

          .description-box,
          .completion-note-box {
            height: auto !important;
            overflow: visible !important;
          }

          .description-content {
            height: auto !important;
            overflow: visible !important;
            white-space: pre-wrap !important;
            overflow-wrap:
              anywhere !important;
            word-break:
              break-word !important;
          }

          .attachments-section {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            display: flex !important;
            flex-direction: column !important;
          }

          .attachments-grid {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            display: grid !important;
            gap: 4mm !important;
            align-items: stretch !important;
          }

          .attachment-card {
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .attachment-preview {
            position: relative !important;
            flex: 1 1 auto !important;
            min-height: 0 !important;
            height: auto !important;
            overflow: hidden !important;
          }

          .attachment-image {
            width: 100% !important;
            height: 100% !important;
            max-width: 100% !important;
            max-height: 100% !important;
            object-fit: contain !important;
          }

          .attachment-video {
            display: none !important;
          }

          .print-video-thumbnail {
            position: absolute !important;
            inset: 0 !important;
            display: block !important;
            width: 100% !important;
            height: 100% !important;
            background: #000000 !important;
            overflow: hidden !important;
          }

          .print-video-thumbnail-image {
            display: block !important;
            width: 100% !important;
            height: 100% !important;
            object-fit: contain !important;
            background: #000000 !important;
          }

          .print-video-placeholder {
            position: absolute !important;
            inset: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 2mm !important;
            background: #f8fafc !important;
            color: #ca8a04 !important;
            font-size: 7px !important;
            font-weight: 900 !important;
            text-transform: uppercase !important;
          }

          .attachment-audio {
            display: none !important;
          }

          .print-audio-label {
            display: block !important;
            color: #64748b !important;
            font-size: 7px !important;
            font-weight: 900 !important;
            text-transform: uppercase !important;
          }

          .report-footer {
            position: absolute !important;
            left: 13mm !important;
            right: 13mm !important;
            bottom: 7mm !important;
            height: 14mm !important;
            background: #ffffff !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .report-pages-container,
          .report-pages-container *,
          .a4-report-page,
          .a4-report-page * {
            scrollbar-width:
              none !important;
          }

          .report-pages-container::-webkit-scrollbar,
          .report-pages-container *::-webkit-scrollbar,
          .a4-report-page::-webkit-scrollbar,
          .a4-report-page *::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
        }

      `}</style>

      <div
        id="printable-report"
        className="report-pages-container"
      >
        {/* ===================================================
            PAGE 1 - ORIGINAL TASK DETAILS
            =================================================== */}

        <section className="a4-report-page first-report-page">
          <ReportHeader
            taskId={task.id}
          />

          <main className="report-page-content">
            <TaskInformation
              task={task}
              assignedUsers={
                assignedUsers
              }
              createdDate={
                createdDate
              }
              validCreatedDate={
                validCreatedDate
              }
            />

            <AttachmentsSection
              attachments={
                taskPages.firstPageAttachments
              }
              startIndex={0}
              showTotalBadge={true}
              totalAttachments={
                attachments.length
              }
              taskId={task.id}
              title="Original Task Attachments"
              emptyText="No Original Task Attachments"
            />
          </main>

          <ReportFooter
            pageNumber={
              currentPageNumber
            }
            totalPages={
              totalPages
            }
          />
        </section>

        {/* ===================================================
            ORIGINAL TASK CONTINUATION PAGES
            =================================================== */}

        {taskPages.continuationPages.map(
          (
            pageAttachments,
            pageIndex
          ) => {
            currentPageNumber += 1;

            const pageNumber =
              currentPageNumber;

            const startIndex =
              FIRST_PAGE_ATTACHMENT_LIMIT +
              pageIndex *
                NEXT_PAGE_ATTACHMENT_LIMIT;

            return (
              <section
                key={`task-page-${pageNumber}`}
                className="
                  a4-report-page
                  continuation-report-page
                "
              >
                <ReportHeader
                  taskId={task.id}
                />

                <main className="report-page-content">
                  <AttachmentsSection
                    attachments={
                      pageAttachments
                    }
                    startIndex={
                      startIndex
                    }
                    showTotalBadge={false}
                    totalAttachments={
                      attachments.length
                    }
                    taskId={task.id}
                    title="Original Task Attachments"
                  />
                </main>

                <ReportFooter
                  pageNumber={
                    pageNumber
                  }
                  totalPages={
                    totalPages
                  }
                />
              </section>
            );
          }
        )}

        {/* ===================================================
            COMPLETE WORK REPORT PAGES
            =================================================== */}

        {completionPages.map(
          (
            completionPage,
            completionPageIndex
          ) => {
            currentPageNumber += 1;

            const pageNumber =
              currentPageNumber;

            const {
              completion,
              reportIndex,
              attachments:
                completionAttachments,
              startIndex,
              type,
            } = completionPage;

            return (
              <section
                key={`completion-page-${completion.id}-${completionPageIndex}`}
                className="
                  a4-report-page
                  completion-report-page
                "
              >
                <ReportHeader
                  taskId={task.id}
                />

                <main className="report-page-content">
                  {type ===
                    "completion-first" && (
                    <CompletionInformation
                      completion={
                        completion
                      }
                      reportNumber={
                        reportIndex + 1
                      }
                      totalReports={
                        completionReports.length
                      }
                    />
                  )}

                  <AttachmentsSection
                    attachments={
                      completionAttachments
                    }
                    startIndex={
                      startIndex
                    }
                    showTotalBadge={
                      type ===
                      "completion-first"
                    }
                    totalAttachments={
                      (
                        completion.media_files ||
                        []
                      ).length +
                      (
                        completion.voice_notes ||
                        []
                      ).length
                    }
                    taskId={task.id}
                    title={
                      type ===
                      "completion-first"
                        ? "Complete Work Evidence"
                        : "Complete Work Evidence - Continued"
                    }
                    emptyText="No Completion Evidence Attached"
                  />
                </main>

                <ReportFooter
                  pageNumber={
                    pageNumber
                  }
                  totalPages={
                    totalPages
                  }
                />
              </section>
            );
          }
        )}
      </div>

      <button
        type="button"
        onClick={handlePrint}
        className="
          fixed
          bottom-10
          right-10
          no-print
          bg-yellow-500
          text-black
          px-6
          py-3
          rounded-full
          font-black
          text-xs
          uppercase
          tracking-widest
          shadow-2xl
          hover:scale-105
          transition-all
          flex
          items-center
          gap-2
          z-50
        "
      >
        <Download size={16} />
        Print Report
      </button>
    </div>
  );
}