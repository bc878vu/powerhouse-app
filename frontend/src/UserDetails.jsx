import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Search } from "lucide-react";
import API from "./api";

// ============================================================
// BACKEND CONFIGURATION
// ============================================================

const BACKEND_URL = "http://localhost:5000";

// ============================================================
// USER DETAILS COMPONENT
// ============================================================

export default function UserDetails() {
  const { id } = useParams();

  // ============================================================
  // STATE
  // ============================================================

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [imageError, setImageError] = useState(false);

  // ============================================================
  // FETCH COMPLETE USER DETAILS
  // ============================================================

  useEffect(() => {
    let isMounted = true;

    const fetchUserDetails = async () => {
      try {
        setLoading(true);
        setError("");
        setImageError(false);

        console.log("========================================");
        console.log("FETCHING USER DETAILS");
        console.log("User ID:", id);
        console.log("API endpoint:", `/user/full/${id}`);
        console.log("========================================");

        const response = await API.get(`/user/full/${id}`);

        console.log("========================================");
        console.log("USER DETAILS API RESPONSE:");
        console.log(response.data);
        console.log("========================================");

        if (isMounted) {
          setData(response.data);
        }
      } catch (err) {
        console.error("========================================");
        console.error("FAILED TO FETCH USER DETAILS");
        console.error(err);
        console.error("========================================");

        if (isMounted) {
          setError(
            err?.response?.data?.message ||
              err?.message ||
              "Failed to load user details."
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (id) {
      fetchUserDetails();
    }

    return () => {
      isMounted = false;
    };
  }, [id]);

  // ============================================================
  // SAFE DATA
  // ============================================================

  const user = data?.user || {};
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  const tools = Array.isArray(data?.tools) ? data.tools : [];

  // ============================================================
  // GET RAW PROFILE PICTURE VALUE
  // Supports different possible backend/database field names.
  // ============================================================

  const getRawProfilePicture = (userData) => {
    if (!userData || typeof userData !== "object") {
      return "";
    }

    return (
      userData.profile_pic ||
      userData.profilePic ||
      userData.profile_picture ||
      userData.profilePicture ||
      userData.profile_image ||
      userData.profileImage ||
      userData.photo ||
      userData.image ||
      userData.avatar ||
      ""
    );
  };

  // ============================================================
  // BUILD COMPLETE PROFILE PICTURE URL
  // ============================================================

  const getProfilePictureUrl = (userData) => {
    const rawValue = getRawProfilePicture(userData);

    if (!rawValue) {
      return "";
    }

    let value = String(rawValue).trim();

    if (!value) {
      return "";
    }

    // Remove surrounding quotes if accidentally stored in database
    value = value.replace(/^["']|["']$/g, "");

    // Convert Windows backslashes to URL slashes
    value = value.replace(/\\/g, "/");

    // Already a complete URL
    if (
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("data:") ||
      value.startsWith("blob:")
    ) {
      return value;
    }

    // Example:
    // uploads/image.jpg
    if (value.startsWith("uploads/")) {
      return `${BACKEND_URL}/${value}`;
    }

    // Example:
    // /uploads/image.jpg
    if (value.startsWith("/uploads/")) {
      return `${BACKEND_URL}${value}`;
    }

    // Example:
    // image.jpg
    return `${BACKEND_URL}/uploads/${value}`;
  };

  // ============================================================
  // PROFILE PICTURE
  // ============================================================

  const profilePictureUrl = useMemo(() => {
    return getProfilePictureUrl(user);
  }, [user]);

  // ============================================================
  // USER INITIALS
  // ============================================================

  const getInitials = (name) => {
    if (!name || typeof name !== "string") {
      return "U";
    }

    const words = name
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 0) {
      return "U";
    }

    if (words.length === 1) {
      return words[0].charAt(0).toUpperCase();
    }

    return (
      words[0].charAt(0) +
      words[words.length - 1].charAt(0)
    ).toUpperCase();
  };

  // ============================================================
  // FILTER TASKS
  // ============================================================

  const filteredTasks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return tasks.filter((task) => {
      const taskStatus = String(task?.status || "").trim();

      const matchesFilter =
        filter === "All" || taskStatus === filter;

      const searchableText = [
        task?.id,
        task?.title,
        task?.description,
        task?.category,
        task?.priority,
        task?.status,
      ]
        .filter(
          (value) =>
            value !== undefined &&
            value !== null
        )
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !normalizedSearch ||
        searchableText.includes(normalizedSearch);

      return matchesFilter && matchesSearch;
    });
  }, [tasks, search, filter]);

  // ============================================================
  // TASK STATISTICS
  // ============================================================

  const stats = useMemo(() => {
    return {
      total: tasks.length,

      completed: tasks.filter(
        (task) =>
          String(task?.status || "").toLowerCase() ===
          "completed"
      ).length,

      rejected: tasks.filter(
        (task) =>
          String(task?.status || "").toLowerCase() ===
          "rejected"
      ).length,

      running: tasks.filter(
        (task) =>
          String(task?.status || "").toLowerCase() ===
          "in progress"
      ).length,

      pending: tasks.filter(
        (task) =>
          String(task?.status || "").toLowerCase() ===
          "pending"
      ).length,
    };
  }, [tasks]);

  // ============================================================
  // STATUS COLOR
  // ============================================================

  const statusColor = (status) => {
    const normalizedStatus = String(status || "").toLowerCase();

    if (normalizedStatus === "completed") {
      return "bg-green-500/20 text-green-300 border border-green-500/30";
    }

    if (normalizedStatus === "rejected") {
      return "bg-red-500/20 text-red-300 border border-red-500/30";
    }

    if (normalizedStatus === "in progress") {
      return "bg-blue-500/20 text-blue-300 border border-blue-500/30";
    }

    return "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30";
  };

  // ============================================================
  // DISPLAY VALUE
  // ============================================================

  const displayValue = (value, fallback = "N/A") => {
    if (
      value === null ||
      value === undefined ||
      String(value).trim() === ""
    ) {
      return fallback;
    }

    return value;
  };

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin mx-auto mb-4" />

          <p className="text-white text-base font-semibold">
            Loading user details...
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // ERROR
  // ============================================================

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="w-full max-w-lg bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
          <h2 className="text-red-300 text-xl font-bold mb-2">
            Unable to load user
          </h2>

          <p className="text-red-200 text-sm">
            {error}
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // NO DATA
  // ============================================================

  if (!data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <p className="text-white text-base">
          No user data found.
        </p>
      </div>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 md:p-10 text-white space-y-6 md:space-y-10">

      {/* ======================================================
          USER HEADER
      ====================================================== */}

      <div className="relative bg-gradient-to-r from-[#0f172a] to-[#1e293b] p-5 sm:p-6 md:p-8 rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden">

        {/* Background Glow */}
        <div className="pointer-events-none absolute -right-10 -top-10 w-40 h-40 bg-yellow-500/20 blur-3xl rounded-full" />

        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-center gap-5 sm:gap-6">

          {/* ==================================================
              PROFILE PICTURE
          ================================================== */}

          <div className="shrink-0">
            {profilePictureUrl && !imageError ? (
              <img
                src={profilePictureUrl}
                alt={`${displayValue(user.name, "User")} profile`}
                className="
                  block
                  w-24
                  h-24
                  sm:w-20
                  sm:h-20
                  md:w-24
                  md:h-24
                  rounded-full
                  object-cover
                  object-center
                  border-4
                  border-yellow-500
                  shadow-lg
                  bg-slate-800
                "
                onLoad={() => {
                  console.log(
                    "Profile picture loaded successfully:",
                    profilePictureUrl
                  );
                }}
                onError={(event) => {
                  console.error(
                    "Profile picture failed to load:",
                    profilePictureUrl
                  );

                  event.currentTarget.style.display = "none";
                  setImageError(true);
                }}
              />
            ) : (
              <div
                className="
                  w-24
                  h-24
                  sm:w-20
                  sm:h-20
                  md:w-24
                  md:h-24
                  rounded-full
                  border-4
                  border-yellow-500
                  bg-slate-800
                  shadow-lg
                  flex
                  items-center
                  justify-center
                  text-yellow-400
                  text-2xl
                  font-extrabold
                "
              >
                {getInitials(user.name)}
              </div>
            )}
          </div>

          {/* ==================================================
              USER BASIC INFORMATION
          ================================================== */}

          <div className="min-w-0 text-center sm:text-left">

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white leading-tight break-words">
              {displayValue(user.name, "Unknown User")}
            </h1>

            <p className="mt-1 text-sm sm:text-base text-slate-300 break-all">
              {displayValue(user.email)}
            </p>

            <span className="inline-flex items-center mt-3 text-xs font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-500/20 px-3 py-1.5 rounded-full uppercase">
              {displayValue(user.role, "User")}
            </span>
          </div>
        </div>
      </div>

      {/* ======================================================
          TASK STATS
      ====================================================== */}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">

        {[
          {
            label: "To Do",
            val: stats.pending,
          },
          {
            label: "Running",
            val: stats.running,
          },
          {
            label: "Completed",
            val: stats.completed,
          },
          {
            label: "Rejected",
            val: stats.rejected,
          },
          {
            label: "Total",
            val: stats.total,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="
              relative
              bg-slate-900/80
              p-4
              sm:p-5
              rounded-2xl
              text-center
              border
              border-white/10
              shadow-lg
              transition
              duration-200
              hover:border-yellow-500/30
            "
          >
            <h2 className="relative z-10 text-2xl font-extrabold text-white">
              {stat.val}
            </h2>

            <p className="relative z-10 mt-1 text-xs sm:text-sm text-slate-300">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* ======================================================
          USER INFO
      ====================================================== */}

      <div className="bg-slate-900/80 border border-white/10 p-5 sm:p-6 md:p-8 rounded-2xl md:rounded-[2rem] shadow-xl">

        <h2 className="text-xl md:text-2xl text-white font-bold mb-6">
          User Info
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">

          {/* Name */}
          <div className="bg-slate-800/80 border border-white/5 p-4 rounded-xl">
            <p className="text-slate-300 text-xs mb-1">
              Name
            </p>

            <p className="text-white font-semibold break-words">
              {displayValue(user.name)}
            </p>
          </div>

          {/* Email */}
          <div className="bg-slate-800/80 border border-white/5 p-4 rounded-xl">
            <p className="text-slate-300 text-xs mb-1">
              Email
            </p>

            <p className="text-white font-semibold break-all">
              {displayValue(user.email)}
            </p>
          </div>

          {/* Phone */}
          <div className="bg-slate-800/80 border border-white/5 p-4 rounded-xl">
            <p className="text-slate-300 text-xs mb-1">
              Phone
            </p>

            <p className="text-white font-semibold break-words">
              {displayValue(user.phone)}
            </p>
          </div>

          {/* Address */}
          <div className="bg-slate-800/80 border border-white/5 p-4 rounded-xl">
            <p className="text-slate-300 text-xs mb-1">
              Address
            </p>

            <p className="text-white font-semibold break-words">
              {displayValue(user.address)}
            </p>
          </div>

          {/* ID */}
          <div className="bg-slate-800/80 border border-white/5 p-4 rounded-xl">
            <p className="text-slate-300 text-xs mb-1">
              Staff ID
            </p>

            <p className="text-white font-semibold">
              #{displayValue(user.id, id)}
            </p>
          </div>

          {/* Account Status */}
          <div className="bg-slate-800/80 border border-white/5 p-4 rounded-xl">
            <p className="text-slate-300 text-xs mb-1">
              Account Status
            </p>

            <p className="text-green-300 font-semibold capitalize">
              {displayValue(user.status, "Active")}
            </p>
          </div>

          {/* Marital Status */}
          {user.marital_status && (
            <div className="bg-slate-800/80 border border-white/5 p-4 rounded-xl">
              <p className="text-slate-300 text-xs mb-1">
                Marital Status
              </p>

              <p className="text-white font-semibold capitalize">
                {user.marital_status}
              </p>
            </div>
          )}

          {/* Background */}
          {user.background && (
            <div className="bg-slate-800/80 border border-white/5 p-4 rounded-xl">
              <p className="text-slate-300 text-xs mb-1">
                Background
              </p>

              <p className="text-white font-semibold break-words">
                {user.background}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================
          TASK SECTION
      ====================================================== */}

      <div className="bg-slate-900/80 border border-white/10 p-5 sm:p-6 rounded-2xl md:rounded-3xl shadow-xl">

        <h2 className="text-xl md:text-2xl text-white font-bold mb-5">
          Tasks
        </h2>

        {/* Search + Filter */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">

          <div className="relative flex-1">

            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"
              size={18}
            />

            <input
              type="text"
              value={search}
              placeholder="Search by task ID, title, description, status..."
              className="
                pl-10
                pr-4
                py-3
                bg-slate-800
                border
                border-white/10
                text-white
                placeholder:text-slate-400
                rounded-xl
                w-full
                focus:outline-none
                focus:ring-2
                focus:ring-yellow-500
                focus:border-yellow-500
              "
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>

          <select
            value={filter}
            className="
              bg-slate-800
              border
              border-white/10
              text-white
              px-4
              py-3
              rounded-xl
              focus:outline-none
              focus:ring-2
              focus:ring-yellow-500
              min-w-[180px]
            "
            onChange={(event) =>
              setFilter(event.target.value)
            }
          >
            <option value="All">All Statuses</option>
            <option value="Pending">Pending</option>
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

        {/* Task List */}

        {filteredTasks.length === 0 ? (
          <div className="bg-slate-800/50 border border-white/5 rounded-xl p-8 text-center">
            <p className="text-slate-300 text-sm">
              No tasks found
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className="
                  flex
                  flex-col
                  sm:flex-row
                  sm:justify-between
                  sm:items-center
                  gap-3
                  bg-slate-800/70
                  border
                  border-white/5
                  p-4
                  rounded-xl
                  hover:bg-slate-800
                  hover:border-white/10
                  transition
                "
              >
                <div className="min-w-0">

                  <p className="text-white font-semibold break-words">
                    #{task.id} -{" "}
                    {displayValue(
                      task.title,
                      "Untitled Task"
                    )}
                  </p>

                  {task.description && (
                    <p className="text-slate-300 text-sm mt-1 line-clamp-2 break-words">
                      {task.description}
                    </p>
                  )}
                </div>

                <span
                  className={`
                    self-start
                    sm:self-auto
                    shrink-0
                    text-xs
                    font-semibold
                    px-3
                    py-1.5
                    rounded-full
                    ${statusColor(task.status)}
                  `}
                >
                  {displayValue(
                    task.status,
                    "Pending"
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ======================================================
          ASSIGNED TOOLS
      ====================================================== */}

      <div className="bg-slate-900/80 border border-white/10 p-5 sm:p-6 rounded-2xl md:rounded-3xl shadow-xl">

        <h2 className="text-xl md:text-2xl text-white font-bold mb-5">
          Assigned Tools
        </h2>

        {tools.length === 0 ? (
          <div className="bg-slate-800/50 border border-white/5 rounded-xl p-8 text-center">
            <p className="text-slate-300 text-sm">
              No tools assigned
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {tools.map((tool, index) => (
              <span
                key={
                  tool.id ||
                  `${tool.tool_name}-${index}`
                }
                className="
                  bg-yellow-500/10
                  border
                  border-yellow-500/30
                  text-yellow-300
                  px-4
                  py-2
                  rounded-full
                  text-xs
                  font-semibold
                  transition
                  hover:bg-yellow-500
                  hover:text-black
                "
              >
                {displayValue(
                  tool.tool_name ||
                    tool.name,
                  "Unnamed Tool"
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}