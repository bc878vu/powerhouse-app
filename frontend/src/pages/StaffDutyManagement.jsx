import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CalendarClock,
  Search,
  Users,
  UserCheck,
  Palmtree,
  UserX,
  Clock3,
  X,
  Save,
  Loader2,
  CalendarDays,
  History,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  BriefcaseBusiness,
} from "lucide-react";

import API from "../api";

// ============================================================
// HELPERS
// ============================================================

function getTodayString() {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatTime(value) {
  if (!value) {
    return "—";
  }

  const cleanValue = String(value).slice(0, 5);

  const parts = cleanValue.split(":");

  if (parts.length < 2) {
    return cleanValue;
  }

  let hours = Number(parts[0]);

  const minutes = parts[1];

  if (Number.isNaN(hours)) {
    return cleanValue;
  }

  const period = hours >= 12 ? "PM" : "AM";

  hours %= 12;

  if (hours === 0) {
    hours = 12;
  }

  return `${hours}:${minutes} ${period}`;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const cleanValue = String(value).slice(0, 10);

  const date = new Date(`${cleanValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return cleanValue;
  }

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getMonthName(month) {
  return new Date(
    2000,
    Number(month) - 1,
    1
  ).toLocaleString(undefined, {
    month: "long",
  });
}

function getInitials(name) {
  return String(name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function getStatusLabel(status) {
  if (status === "on_duty") {
    return "On Duty";
  }

  if (status === "off_duty") {
    return "Off Duty";
  }

  if (status === "leave") {
    return "On Leave";
  }

  return "Not Marked";
}

function getStatusClasses(status) {
  if (status === "on_duty") {
    return (
      "bg-green-500/10 " +
      "text-green-400 " +
      "border-green-500/20"
    );
  }

  if (status === "leave") {
    return (
      "bg-yellow-500/10 " +
      "text-yellow-400 " +
      "border-yellow-500/20"
    );
  }

  if (status === "off_duty") {
    return (
      "bg-red-500/10 " +
      "text-red-400 " +
      "border-red-500/20"
    );
  }

  return (
    "bg-slate-700/30 " +
    "text-slate-400 " +
    "border-white/5"
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function StaffDutyManagement() {
  const now = new Date();

  // ==========================================================
  // MAIN STATE
  // ==========================================================

  const [staff, setStaff] = useState([]);

  const [summary, setSummary] = useState({
    totalStaff: 0,
    onDutyToday: 0,
    onLeaveToday: 0,
    offToday: 0,
  });

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] = useState("");

  // ==========================================================
  // FILTER STATE
  // ==========================================================

  const [search, setSearch] = useState("");

  const [roleFilter, setRoleFilter] =
    useState("All");

  const [statusFilter, setStatusFilter] =
    useState("All");

  const [selectedYear, setSelectedYear] =
    useState(now.getFullYear());

  const [selectedMonth, setSelectedMonth] =
    useState(now.getMonth() + 1);

  // ==========================================================
  // MANAGE MODAL STATE
  // ==========================================================

  const [selectedStaff, setSelectedStaff] =
    useState(null);

  const [activeTab, setActiveTab] =
    useState("duty");

  const [savingDuty, setSavingDuty] =
    useState(false);

  const [savingShift, setSavingShift] =
    useState(false);

  const [loadingHistory, setLoadingHistory] =
    useState(false);

  const [historyData, setHistoryData] =
    useState({
      shifts: [],
      duties: [],
    });

  // ==========================================================
  // DUTY FORM
  // ==========================================================

  const [dutyForm, setDutyForm] = useState({
    duty_date: getTodayString(),
    status: "on_duty",
    notes: "",
  });

  // ==========================================================
  // SHIFT FORM
  // ==========================================================

  const [shiftForm, setShiftForm] = useState({
    shift_name: "Morning Shift",
    start_time: "08:00",
    end_time: "16:00",
    effective_from: getTodayString(),
    notes: "",
  });

  // ==========================================================
  // LOAD DATA
  // ==========================================================

  const fetchData = async (
    showFullLoader = false
  ) => {
    try {
      setError("");

      if (showFullLoader) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const [staffResponse, summaryResponse] =
        await Promise.all([
          API.get(
            `/duty/staff?year=${selectedYear}` +
              `&month=${selectedMonth}`
          ),

          API.get("/duty/summary"),
        ]);

      const staffData =
        staffResponse?.data?.staff;

      setStaff(
        Array.isArray(staffData)
          ? staffData
          : []
      );

      setSummary({
        totalStaff: Number(
          summaryResponse?.data?.totalStaff || 0
        ),

        onDutyToday: Number(
          summaryResponse?.data?.onDutyToday || 0
        ),

        onLeaveToday: Number(
          summaryResponse?.data?.onLeaveToday || 0
        ),

        offToday: Number(
          summaryResponse?.data?.offToday || 0
        ),
      });
    } catch (err) {
      console.error(
        "❌ Duty data fetch error:",
        err
      );

      setError(
        err?.response?.data?.message ||
          "Failed to load duty management data."
      );

      setStaff([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData(true);
  }, [selectedYear, selectedMonth]);

  // ==========================================================
  // FILTERED STAFF
  // ==========================================================

  const roles = useMemo(() => {
    return [
      ...new Set(
        staff
          .map((item) => item.role)
          .filter(Boolean)
      ),
    ].sort();
  }, [staff]);

  const filteredStaff = useMemo(() => {
    const cleanSearch = search
      .trim()
      .toLowerCase();

    return staff.filter((item) => {
      const matchesSearch =
        !cleanSearch ||
        String(item.name || "")
          .toLowerCase()
          .includes(cleanSearch) ||
        String(item.email || "")
          .toLowerCase()
          .includes(cleanSearch) ||
        String(item.id || "").includes(
          cleanSearch
        );

      const matchesRole =
        roleFilter === "All" ||
        item.role === roleFilter;

      const currentStatus =
        item.todayDuty?.status || "not_marked";

      const matchesStatus =
        statusFilter === "All" ||
        currentStatus === statusFilter;

      return (
        matchesSearch &&
        matchesRole &&
        matchesStatus
      );
    });
  }, [
    staff,
    search,
    roleFilter,
    statusFilter,
  ]);

  // ==========================================================
  // MONTH NAVIGATION
  // ==========================================================

  const goToPreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((prev) => prev - 1);
      return;
    }

    setSelectedMonth((prev) => prev - 1);
  };

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((prev) => prev + 1);
      return;
    }

    setSelectedMonth((prev) => prev + 1);
  };

  // ==========================================================
  // OPEN MANAGE MODAL
  // ==========================================================

  const openManageModal = (item) => {
    setSelectedStaff(item);

    setActiveTab("duty");

    setHistoryData({
      shifts: [],
      duties: [],
    });

    setDutyForm({
      duty_date: getTodayString(),

      status:
        item.todayDuty?.status ||
        "on_duty",

      notes:
        item.todayDuty?.notes || "",
    });

    setShiftForm({
      shift_name:
        item.currentShift?.shift_name ||
        "Morning Shift",

      start_time:
        String(
          item.currentShift?.start_time ||
            "08:00"
        ).slice(0, 5),

      end_time:
        String(
          item.currentShift?.end_time ||
            "16:00"
        ).slice(0, 5),

      effective_from: getTodayString(),

      notes:
        item.currentShift?.notes || "",
    });
  };

  // ==========================================================
  // CLOSE MANAGE MODAL
  // ==========================================================

  const closeManageModal = () => {
    if (savingDuty || savingShift) {
      return;
    }

    setSelectedStaff(null);

    setActiveTab("duty");

    setHistoryData({
      shifts: [],
      duties: [],
    });
  };

  // ==========================================================
  // LOAD HISTORY
  // ==========================================================

  const loadHistory = async () => {
    if (!selectedStaff?.id) {
      return;
    }

    try {
      setLoadingHistory(true);

      const response = await API.get(
        `/duty/user/${selectedStaff.id}/history`
      );

      setHistoryData({
        shifts: Array.isArray(
          response?.data?.shifts
        )
          ? response.data.shifts
          : [],

        duties: Array.isArray(
          response?.data?.duties
        )
          ? response.data.duties
          : [],
      });
    } catch (err) {
      console.error(
        "❌ History load error:",
        err
      );

      alert(
        err?.response?.data?.message ||
          "Failed to load duty history."
      );
    } finally {
      setLoadingHistory(false);
    }
  };

  const changeTab = (tab) => {
    setActiveTab(tab);

    if (
      tab === "history" &&
      selectedStaff?.id
    ) {
      loadHistory();
    }
  };

  // ==========================================================
  // SAVE DUTY STATUS
  // ==========================================================

  const saveDutyStatus = async () => {
    if (!selectedStaff?.id) {
      return;
    }

    if (!dutyForm.duty_date) {
      alert("Please select duty date.");
      return;
    }

    try {
      setSavingDuty(true);

      const response = await API.post(
        "/duty/mark-status",
        {
          user_id: selectedStaff.id,

          duty_date: dutyForm.duty_date,

          status: dutyForm.status,

          notes: dutyForm.notes.trim(),
        }
      );

      alert(
        response?.data?.message ||
          "Duty status saved successfully."
      );

      await fetchData(false);

      setSelectedStaff(null);
    } catch (err) {
      console.error(
        "❌ Save duty error:",
        err
      );

      alert(
        err?.response?.data?.message ||
          "Failed to save duty status."
      );
    } finally {
      setSavingDuty(false);
    }
  };

  // ==========================================================
  // SAVE SHIFT
  // ==========================================================

  const saveShift = async () => {
    if (!selectedStaff?.id) {
      return;
    }

    if (!shiftForm.shift_name.trim()) {
      alert("Please enter shift name.");
      return;
    }

    if (
      !shiftForm.start_time ||
      !shiftForm.end_time
    ) {
      alert(
        "Please select start and end time."
      );

      return;
    }

    if (!shiftForm.effective_from) {
      alert(
        "Please select effective-from date."
      );

      return;
    }

    try {
      setSavingShift(true);

      const response = await API.post(
        "/duty/assign-shift",
        {
          user_id: selectedStaff.id,

          shift_name:
            shiftForm.shift_name.trim(),

          start_time: shiftForm.start_time,

          end_time: shiftForm.end_time,

          effective_from:
            shiftForm.effective_from,

          notes: shiftForm.notes.trim(),
        }
      );

      alert(
        response?.data?.message ||
          "Shift assigned successfully."
      );

      await fetchData(false);

      setSelectedStaff(null);
    } catch (err) {
      console.error(
        "❌ Save shift error:",
        err
      );

      alert(
        err?.response?.data?.message ||
          "Failed to assign shift."
      );
    } finally {
      setSavingShift(false);
    }
  };

  // ==========================================================
  // STAT CARDS
  // ==========================================================

  const statCards = [
    {
      label: "Total Staff",

      value: summary.totalStaff,

      icon: Users,

      classes:
        "text-blue-400 bg-blue-500/10",
    },

    {
      label: "On Duty Today",

      value: summary.onDutyToday,

      icon: UserCheck,

      classes:
        "text-green-400 bg-green-500/10",
    },

    {
      label: "On Leave Today",

      value: summary.onLeaveToday,

      icon: Palmtree,

      classes:
        "text-yellow-400 bg-yellow-500/10",
    },

    {
      label: "Off Today",

      value: summary.offToday,

      icon: UserX,

      classes:
        "text-red-400 bg-red-500/10",
    },
  ];

  // ==========================================================
  // LOADING
  // ==========================================================

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2
            size={42}
            className="animate-spin text-yellow-500 mx-auto"
          />

          <p className="text-slate-500 text-xs font-black uppercase tracking-[0.25em] mt-4">
            Loading Duty Management
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="p-4 md:p-6 lg:p-8 text-white animate-in fade-in duration-700">
      {/* ====================================================
          PAGE HEADER
      ==================================================== */}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <CalendarClock
              size={24}
              className="text-yellow-500"
            />

            <p className="text-[10px] text-yellow-500 font-black uppercase tracking-[0.3em]">
              Workforce Operations
            </p>
          </div>

          <h1 className="text-3xl md:text-4xl font-black italic uppercase tracking-tight">
            Staff{" "}
            <span className="text-yellow-500 not-italic">
              Duty Management
            </span>
          </h1>

          <p className="text-slate-500 text-sm mt-2 max-w-2xl">
            Manage staff shifts, daily duty
            status, leave records and monthly
            attendance.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchData(false)}
          disabled={refreshing}
          className="
            bg-yellow-500
            hover:bg-yellow-400
            disabled:opacity-50
            text-slate-950
            px-5
            py-3
            rounded-xl
            text-xs
            font-black
            uppercase
            tracking-wider
            flex
            items-center
            justify-center
            gap-2
            transition-all
          "
        >
          <RefreshCw
            size={17}
            className={
              refreshing ? "animate-spin" : ""
            }
          />

          Refresh
        </button>
      </div>

      {/* ====================================================
          ERROR
      ==================================================== */}

      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl flex items-center gap-3">
          <AlertCircle size={20} />

          <p className="text-sm font-bold">
            {error}
          </p>
        </div>
      )}

      {/* ====================================================
          SUMMARY CARDS
      ==================================================== */}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => {
          const Icon = card.icon;

          return (
            <div
              key={card.label}
              className="
                bg-slate-900/50
                border
                border-white/5
                rounded-[2rem]
                p-5
                md:p-6
                shadow-xl
              "
            >
              <div
                className={`
                  w-12
                  h-12
                  rounded-2xl
                  flex
                  items-center
                  justify-center
                  mb-4
                  ${card.classes}
                `}
              >
                <Icon size={23} />
              </div>

              <h2 className="text-3xl font-black italic">
                {card.value}
              </h2>

              <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] mt-2">
                {card.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* ====================================================
          FILTERS
      ==================================================== */}

      <div className="bg-slate-900/40 border border-white/5 rounded-[2rem] p-5 md:p-6 mb-6 shadow-xl">
        <div className="flex flex-col xl:flex-row gap-4">
          {/* SEARCH */}

          <div className="relative flex-1">
            <Search
              size={17}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search by name, email or staff ID..."
              className="
                w-full
                bg-slate-950/70
                border
                border-white/5
                rounded-xl
                pl-11
                pr-4
                py-3.5
                text-sm
                text-white
                outline-none
                focus:border-yellow-500/50
              "
            />
          </div>

          {/* ROLE */}

          <select
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(event.target.value)
            }
            className="
              bg-slate-950/70
              border
              border-white/5
              rounded-xl
              px-4
              py-3.5
              text-sm
              text-white
              outline-none
            "
          >
            <option value="All">
              All Roles
            </option>

            {roles.map((role) => (
              <option
                key={role}
                value={role}
              >
                {role}
              </option>
            ))}
          </select>

          {/* STATUS */}

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value
              )
            }
            className="
              bg-slate-950/70
              border
              border-white/5
              rounded-xl
              px-4
              py-3.5
              text-sm
              text-white
              outline-none
            "
          >
            <option value="All">
              All Status
            </option>

            <option value="on_duty">
              On Duty
            </option>

            <option value="leave">
              On Leave
            </option>

            <option value="off_duty">
              Off Duty
            </option>

            <option value="not_marked">
              Not Marked
            </option>
          </select>

          {/* MONTH NAVIGATION */}

          <div className="flex items-center bg-slate-950/70 border border-white/5 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={goToPreviousMonth}
              className="p-3.5 hover:bg-white/5 text-slate-400 hover:text-white"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="px-4 min-w-[150px] text-center">
              <p className="text-xs font-black">
                {getMonthName(selectedMonth)}{" "}
                {selectedYear}
              </p>
            </div>

            <button
              type="button"
              onClick={goToNextMonth}
              className="p-3.5 hover:bg-white/5 text-slate-400 hover:text-white"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* ====================================================
          STAFF LIST
      ==================================================== */}

      <div className="bg-slate-900/40 border border-white/5 rounded-[2rem] shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="font-black uppercase italic">
              Staff Duty Records
            </h2>

            <p className="text-[9px] text-slate-600 uppercase tracking-widest mt-1">
              {filteredStaff.length} staff members
              shown
            </p>
          </div>

          <CalendarDays
            size={22}
            className="text-yellow-500"
          />
        </div>

        {filteredStaff.length === 0 ? (
          <div className="py-20 text-center">
            <Users
              size={50}
              className="mx-auto text-slate-800 mb-4"
            />

            <p className="text-slate-600 font-black uppercase tracking-widest text-xs">
              No staff records found
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="border-b border-white/5">
                  {[
                    "Staff",
                    "Role",
                    "Current Shift",
                    "Duty Time",
                    "Today",
                    "Duty Days",
                    "Leave",
                    "Off",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="text-left px-5 py-4 text-[9px] text-slate-600 font-black uppercase tracking-widest"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredStaff.map((item) => {
                  const status =
                    item.todayDuty?.status ||
                    "not_marked";

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-all"
                    >
                      {/* STAFF */}

                      <td className="px-5 py-5">
                        <div className="flex items-center gap-3">
                          {item.profile_pic ? (
                            <img
                              src={item.profile_pic}
                              alt={item.name}
                              className="w-11 h-11 rounded-xl object-cover border border-yellow-500/20"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-yellow-500 text-slate-950 flex items-center justify-center font-black text-xs">
                              {getInitials(
                                item.name
                              )}
                            </div>
                          )}

                          <div>
                            <p className="font-black text-sm">
                              {item.name}
                            </p>

                            <p className="text-[9px] text-slate-600 mt-1">
                              ID #{item.id}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* ROLE */}

                      <td className="px-5 py-5">
                        <span className="text-[10px] text-slate-400 uppercase font-bold">
                          {item.role || "User"}
                        </span>
                      </td>

                      {/* SHIFT */}

                      <td className="px-5 py-5">
                        {item.currentShift ? (
                          <div>
                            <p className="text-xs font-black text-white">
                              {
                                item.currentShift
                                  .shift_name
                              }
                            </p>

                            <p className="text-[9px] text-slate-600 mt-1">
                              From{" "}
                              {formatDate(
                                item.currentShift
                                  .effective_from
                              )}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-600">
                            No shift assigned
                          </span>
                        )}
                      </td>

                      {/* DUTY TIME */}

                      <td className="px-5 py-5">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Clock3
                            size={14}
                            className="text-yellow-500"
                          />

                          {item.currentShift
                            ? `${formatTime(
                                item.currentShift
                                  .start_time
                              )} - ${formatTime(
                                item.currentShift
                                  .end_time
                              )}`
                            : "—"}
                        </div>
                      </td>

                      {/* TODAY */}

                      <td className="px-5 py-5">
                        <span
                          className={`
                            inline-flex
                            px-3
                            py-1.5
                            rounded-full
                            border
                            text-[9px]
                            font-black
                            uppercase
                            tracking-wider
                            ${getStatusClasses(
                              status
                            )}
                          `}
                        >
                          {getStatusLabel(status)}
                        </span>
                      </td>

                      {/* DUTY DAYS */}

                      <td className="px-5 py-5">
                        <span className="text-green-400 font-black">
                          {
                            item.monthlySummary
                              ?.dutyDays || 0
                          }
                        </span>
                      </td>

                      {/* LEAVE */}

                      <td className="px-5 py-5">
                        <span className="text-yellow-400 font-black">
                          {
                            item.monthlySummary
                              ?.leaveDays || 0
                          }
                        </span>
                      </td>

                      {/* OFF */}

                      <td className="px-5 py-5">
                        <span className="text-red-400 font-black">
                          {
                            item.monthlySummary
                              ?.offDays || 0
                          }
                        </span>
                      </td>

                      {/* ACTION */}

                      <td className="px-5 py-5">
                        <button
                          type="button"
                          onClick={() =>
                            openManageModal(item)
                          }
                          className="
                            bg-yellow-500
                            hover:bg-yellow-400
                            text-slate-950
                            px-4
                            py-2.5
                            rounded-xl
                            text-[10px]
                            font-black
                            uppercase
                            tracking-wider
                            transition-all
                          "
                        >
                          Manage Duty
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ====================================================
          MANAGE MODAL
      ==================================================== */}

      {selectedStaff && (
        <div
          className="
            fixed
            inset-0
            z-[9999]
            bg-black/80
            backdrop-blur-md
            flex
            items-center
            justify-center
            p-4
          "
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              closeManageModal();
            }
          }}
        >
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-slate-950 border border-white/10 rounded-[2rem] md:rounded-[3rem] shadow-2xl">
            {/* MODAL HEADER */}

            <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-xl border-b border-white/10 px-6 md:px-8 py-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-yellow-500 text-slate-950 flex items-center justify-center font-black">
                  {getInitials(
                    selectedStaff.name
                  )}
                </div>

                <div>
                  <p className="text-[9px] text-yellow-500 uppercase tracking-[0.25em] font-black">
                    Staff #{selectedStaff.id}
                  </p>

                  <h2 className="text-xl font-black text-white mt-1">
                    {selectedStaff.name}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={closeManageModal}
                disabled={
                  savingDuty || savingShift
                }
                className="w-11 h-11 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl flex items-center justify-center transition-all"
              >
                <X size={21} />
              </button>
            </div>

            {/* TABS */}

            <div className="px-6 md:px-8 pt-6">
              <div className="grid grid-cols-3 bg-slate-900 rounded-2xl p-1.5">
                <button
                  type="button"
                  onClick={() =>
                    changeTab("duty")
                  }
                  className={`
                    py-3
                    rounded-xl
                    text-[10px]
                    font-black
                    uppercase
                    tracking-wider
                    transition-all
                    ${
                      activeTab === "duty"
                        ? "bg-yellow-500 text-slate-950"
                        : "text-slate-500 hover:text-white"
                    }
                  `}
                >
                  Daily Duty
                </button>

                <button
                  type="button"
                  onClick={() =>
                    changeTab("shift")
                  }
                  className={`
                    py-3
                    rounded-xl
                    text-[10px]
                    font-black
                    uppercase
                    tracking-wider
                    transition-all
                    ${
                      activeTab === "shift"
                        ? "bg-yellow-500 text-slate-950"
                        : "text-slate-500 hover:text-white"
                    }
                  `}
                >
                  Assign Shift
                </button>

                <button
                  type="button"
                  onClick={() =>
                    changeTab("history")
                  }
                  className={`
                    py-3
                    rounded-xl
                    text-[10px]
                    font-black
                    uppercase
                    tracking-wider
                    transition-all
                    ${
                      activeTab === "history"
                        ? "bg-yellow-500 text-slate-950"
                        : "text-slate-500 hover:text-white"
                    }
                  `}
                >
                  History
                </button>
              </div>
            </div>

            {/* MODAL CONTENT */}

            <div className="p-6 md:p-8">
              {/* ==========================================
                  DAILY DUTY TAB
              ========================================== */}

              {activeTab === "duty" && (
                <div className="space-y-6">
                  <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-5">
                      <CalendarDays
                        size={20}
                        className="text-yellow-500"
                      />

                      <h3 className="font-black uppercase italic">
                        Mark Daily Duty Status
                      </h3>
                    </div>

                    <div className="grid md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[9px] text-slate-500 uppercase tracking-widest font-black mb-2">
                          Duty Date
                        </label>

                        <input
                          type="date"
                          value={
                            dutyForm.duty_date
                          }
                          onChange={(event) =>
                            setDutyForm(
                              (prev) => ({
                                ...prev,

                                duty_date:
                                  event.target
                                    .value,
                              })
                            )
                          }
                          className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-yellow-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] text-slate-500 uppercase tracking-widest font-black mb-2">
                          Duty Status
                        </label>

                        <select
                          value={dutyForm.status}
                          onChange={(event) =>
                            setDutyForm(
                              (prev) => ({
                                ...prev,

                                status:
                                  event.target
                                    .value,
                              })
                            )
                          }
                          className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-yellow-500"
                        >
                          <option value="on_duty">
                            On Duty
                          </option>

                          <option value="leave">
                            On Leave
                          </option>

                          <option value="off_duty">
                            Off Duty
                          </option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-5">
                      <label className="block text-[9px] text-slate-500 uppercase tracking-widest font-black mb-2">
                        Notes
                      </label>

                      <textarea
                        rows={4}
                        value={dutyForm.notes}
                        onChange={(event) =>
                          setDutyForm((prev) => ({
                            ...prev,

                            notes:
                              event.target.value,
                          }))
                        }
                        placeholder="Optional leave reason, off-duty note or duty information..."
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none resize-none focus:border-yellow-500"
                      />
                    </div>
                  </div>

                  {/* CURRENT SHIFT INFO */}

                  <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-5">
                    <p className="text-[9px] text-blue-400 font-black uppercase tracking-widest mb-3">
                      Current Shift
                    </p>

                    {selectedStaff.currentShift ? (
                      <div className="grid sm:grid-cols-3 gap-4">
                        <div>
                          <p className="text-[9px] text-slate-600 uppercase">
                            Shift
                          </p>

                          <p className="font-black mt-1">
                            {
                              selectedStaff
                                .currentShift
                                .shift_name
                            }
                          </p>
                        </div>

                        <div>
                          <p className="text-[9px] text-slate-600 uppercase">
                            Start
                          </p>

                          <p className="font-black mt-1">
                            {formatTime(
                              selectedStaff
                                .currentShift
                                .start_time
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[9px] text-slate-600 uppercase">
                            End
                          </p>

                          <p className="font-black mt-1">
                            {formatTime(
                              selectedStaff
                                .currentShift
                                .end_time
                            )}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-500 text-sm">
                        No active shift assigned.
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={saveDutyStatus}
                    disabled={savingDuty}
                    className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-slate-950 py-4 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all"
                  >
                    {savingDuty ? (
                      <>
                        <Loader2
                          size={18}
                          className="animate-spin"
                        />

                        Saving Duty...
                      </>
                    ) : (
                      <>
                        <Save size={18} />

                        Save Duty Status
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* ==========================================
                  ASSIGN SHIFT TAB
              ========================================== */}

              {activeTab === "shift" && (
                <div className="space-y-6">
                  <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-5">
                      <BriefcaseBusiness
                        size={20}
                        className="text-yellow-500"
                      />

                      <h3 className="font-black uppercase italic">
                        Assign New Shift
                      </h3>
                    </div>

                    <div className="grid md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[9px] text-slate-500 uppercase tracking-widest font-black mb-2">
                          Shift Name
                        </label>

                        <select
                          value={
                            shiftForm.shift_name
                          }
                          onChange={(event) => {
                            const value =
                              event.target.value;

                            let start = "08:00";
                            let end = "16:00";

                            if (
                              value ===
                              "Evening Shift"
                            ) {
                              start = "16:00";
                              end = "00:00";
                            }

                            if (
                              value ===
                              "Night Shift"
                            ) {
                              start = "20:00";
                              end = "08:00";
                            }

                            setShiftForm(
                              (prev) => ({
                                ...prev,

                                shift_name: value,

                                start_time: start,

                                end_time: end,
                              })
                            );
                          }}
                          className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-yellow-500"
                        >
                          <option>
                            Morning Shift
                          </option>

                          <option>
                            Evening Shift
                          </option>

                          <option>
                            Night Shift
                          </option>

                          <option>
                            Custom Shift
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[9px] text-slate-500 uppercase tracking-widest font-black mb-2">
                          Effective From
                        </label>

                        <input
                          type="date"
                          value={
                            shiftForm.effective_from
                          }
                          onChange={(event) =>
                            setShiftForm(
                              (prev) => ({
                                ...prev,

                                effective_from:
                                  event.target
                                    .value,
                              })
                            )
                          }
                          className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-yellow-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] text-slate-500 uppercase tracking-widest font-black mb-2">
                          Start Time
                        </label>

                        <input
                          type="time"
                          value={
                            shiftForm.start_time
                          }
                          onChange={(event) =>
                            setShiftForm(
                              (prev) => ({
                                ...prev,

                                start_time:
                                  event.target
                                    .value,
                              })
                            )
                          }
                          className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-yellow-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] text-slate-500 uppercase tracking-widest font-black mb-2">
                          End Time
                        </label>

                        <input
                          type="time"
                          value={shiftForm.end_time}
                          onChange={(event) =>
                            setShiftForm(
                              (prev) => ({
                                ...prev,

                                end_time:
                                  event.target
                                    .value,
                              })
                            )
                          }
                          className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-yellow-500"
                        />
                      </div>
                    </div>

                    <div className="mt-5">
                      <label className="block text-[9px] text-slate-500 uppercase tracking-widest font-black mb-2">
                        Shift Notes
                      </label>

                      <textarea
                        rows={4}
                        value={shiftForm.notes}
                        onChange={(event) =>
                          setShiftForm((prev) => ({
                            ...prev,

                            notes:
                              event.target.value,
                          }))
                        }
                        placeholder="Optional shift assignment notes..."
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none resize-none focus:border-yellow-500"
                      />
                    </div>
                  </div>

                  <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-2xl p-5">
                    <p className="text-yellow-400 text-xs font-bold leading-relaxed">
                      Assigning a new shift will
                      close the employee's previous
                      active shift and preserve it in
                      shift history. The new shift
                      will become the current active
                      shift.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={saveShift}
                    disabled={savingShift}
                    className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-slate-950 py-4 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all"
                  >
                    {savingShift ? (
                      <>
                        <Loader2
                          size={18}
                          className="animate-spin"
                        />

                        Assigning Shift...
                      </>
                    ) : (
                      <>
                        <Save size={18} />

                        Assign New Shift
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* ==========================================
                  HISTORY TAB
              ========================================== */}

              {activeTab === "history" && (
                <div className="space-y-8">
                  {loadingHistory ? (
                    <div className="py-20 text-center">
                      <Loader2
                        size={35}
                        className="animate-spin text-yellow-500 mx-auto"
                      />

                      <p className="text-slate-600 text-[10px] uppercase tracking-widest font-black mt-4">
                        Loading History
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* SHIFT HISTORY */}

                      <div>
                        <div className="flex items-center gap-3 mb-4">
                          <History
                            size={19}
                            className="text-yellow-500"
                          />

                          <h3 className="font-black uppercase italic">
                            Shift History
                          </h3>
                        </div>

                        {historyData.shifts.length ===
                        0 ? (
                          <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-8 text-center text-slate-600 text-sm">
                            No shift history found.
                          </div>
                        ) : (
                          <div className="grid gap-3">
                            {historyData.shifts.map(
                              (shift) => (
                                <div
                                  key={shift.id}
                                  className="bg-slate-900/60 border border-white/5 rounded-2xl p-5"
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <p className="font-black">
                                          {
                                            shift.shift_name
                                          }
                                        </p>

                                        {Number(
                                          shift.is_active
                                        ) === 1 && (
                                          <span className="text-[8px] bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-1 rounded-full uppercase font-black">
                                            Active
                                          </span>
                                        )}
                                      </div>

                                      <p className="text-xs text-slate-500 mt-2">
                                        {formatTime(
                                          shift.start_time
                                        )}{" "}
                                        -{" "}
                                        {formatTime(
                                          shift.end_time
                                        )}
                                      </p>
                                    </div>

                                    <div className="text-right">
                                      <p className="text-[9px] text-slate-500 uppercase">
                                        Effective Period
                                      </p>

                                      <p className="text-xs font-bold mt-1">
                                        {formatDate(
                                          shift.effective_from
                                        )}{" "}
                                        →{" "}
                                        {shift.effective_to
                                          ? formatDate(
                                              shift.effective_to
                                            )
                                          : "Current"}
                                      </p>
                                    </div>
                                  </div>

                                  {shift.notes && (
                                    <p className="text-xs text-slate-500 mt-4 pt-4 border-t border-white/5">
                                      {shift.notes}
                                    </p>
                                  )}
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>

                      {/* DUTY HISTORY */}

                      <div>
                        <div className="flex items-center gap-3 mb-4">
                          <CalendarDays
                            size={19}
                            className="text-yellow-500"
                          />

                          <h3 className="font-black uppercase italic">
                            Duty History
                          </h3>
                        </div>

                        {historyData.duties.length ===
                        0 ? (
                          <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-8 text-center text-slate-600 text-sm">
                            No duty history found.
                          </div>
                        ) : (
                          <div className="grid gap-3 max-h-[420px] overflow-y-auto pr-1">
                            {historyData.duties.map(
                              (duty) => (
                                <div
                                  key={duty.id}
                                  className="bg-slate-900/60 border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                                >
                                  <div>
                                    <p className="font-black text-sm">
                                      {formatDate(
                                        duty.duty_date
                                      )}
                                    </p>

                                    <p className="text-[10px] text-slate-600 mt-1">
                                      {duty.shift_name ||
                                        "No shift"}{" "}
                                      •{" "}
                                      {formatTime(
                                        duty.start_time
                                      )}{" "}
                                      -{" "}
                                      {formatTime(
                                        duty.end_time
                                      )}
                                    </p>

                                    {duty.notes && (
                                      <p className="text-xs text-slate-500 mt-2">
                                        {duty.notes}
                                      </p>
                                    )}
                                  </div>

                                  <span
                                    className={`
                                      inline-flex
                                      self-start
                                      sm:self-center
                                      px-3
                                      py-1.5
                                      rounded-full
                                      border
                                      text-[9px]
                                      font-black
                                      uppercase
                                      ${getStatusClasses(
                                        duty.status
                                      )}
                                    `}
                                  >
                                    {getStatusLabel(
                                      duty.status
                                    )}
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}