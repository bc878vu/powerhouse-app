import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import API from './api';

import {
  Trash2,
  Edit,
  Eye,
  Printer,
  X,
  RefreshCw,
  Clock3,
  UserCheck,
  UserX,
  Palmtree,
  BriefcaseBusiness,
  Save,
  Loader2,
  History,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// ============================================================
// HELPERS
// ============================================================

const getTodayDate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getCurrentYear = () => new Date().getFullYear();
const getCurrentMonth = () => new Date().getMonth() + 1;

const formatDate = (value) => {
  if (!value) return 'N/A';

  const stringValue = String(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    const [year, month, day] = stringValue.split('-');
    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return stringValue;
  }

  return date.toLocaleDateString();
};

const formatTime = (value) => {
  if (!value) return 'N/A';

  const time = String(value);
  const parts = time.split(':');

  if (parts.length < 2) return time;

  let hour = Number(parts[0]);
  const minute = parts[1];
  const period = hour >= 12 ? 'PM' : 'AM';

  hour = hour % 12 || 12;

  return `${hour}:${minute} ${period}`;
};

const getErrorMessage = (error) => {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    'Something went wrong.'
  );
};

const normalizeToolsResponse = (responseData) => {
  if (Array.isArray(responseData)) return responseData;
  if (Array.isArray(responseData?.tools)) return responseData.tools;
  if (Array.isArray(responseData?.data)) return responseData.data;

  return [];
};

// ============================================================
// PROFILE IMAGE HELPERS
// ============================================================

const getApiOrigin = () => {
  const envOrigin =
    import.meta.env.VITE_API_ORIGIN ||
    import.meta.env.VITE_API_URL ||
    '';

  if (envOrigin) {
    return String(envOrigin)
      .replace(/\/api\/?$/, '')
      .replace(/\/+$/, '');
  }

  return 'http://localhost:5000';
};

const API_ORIGIN = getApiOrigin();

const getRawProfilePic = (userOrValue) => {
  if (!userOrValue) return '';

  if (typeof userOrValue === 'string') {
    return userOrValue.trim();
  }

  return String(
    userOrValue.profile_pic ||
      userOrValue.profilePic ||
      userOrValue.profile_image ||
      userOrValue.profileImage ||
      userOrValue.photo ||
      userOrValue.image ||
      userOrValue.avatar ||
      ''
  ).trim();
};

const getProfileImage = (userOrValue) => {
  const rawImage = getRawProfilePic(userOrValue);

  if (!rawImage) return '';

  if (
    rawImage.startsWith('http://') ||
    rawImage.startsWith('https://') ||
    rawImage.startsWith('blob:') ||
    rawImage.startsWith('data:')
  ) {
    return rawImage;
  }

  let cleanPath = rawImage.replace(/\\/g, '/').trim();

  const uploadsIndex = cleanPath.toLowerCase().lastIndexOf('/uploads/');

  if (uploadsIndex !== -1) {
    cleanPath = cleanPath.slice(uploadsIndex + 1);
  }

  cleanPath = cleanPath.replace(/^\/+/, '');

  if (cleanPath.toLowerCase().startsWith('uploads/')) {
    return `${API_ORIGIN}/${cleanPath}`;
  }

  return `${API_ORIGIN}/uploads/${cleanPath}`;
};

const getUserInitials = (name = '') => {
  const words = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'U';

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function StaffRecord() {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const usersPerPage = 5;

  // ==========================================================
  // DUTY DATA
  // ==========================================================

  const [selectedYear, setSelectedYear] = useState(getCurrentYear());
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [dutyStaff, setDutyStaff] = useState([]);

  const [dutySummary, setDutySummary] = useState({
    totalStaff: 0,
    onDutyToday: 0,
    onLeaveToday: 0,
    offToday: 0,
  });

  // ==========================================================
  // EDIT USER
  // ==========================================================

  const [selectedUser, setSelectedUser] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [updatingUser, setUpdatingUser] = useState(false);

  // ==========================================================
  // VIEW / PRINT
  // ==========================================================

  const [viewUser, setViewUser] = useState(null);
  const [assignedTools, setAssignedTools] = useState([]);
  const [loadingTools, setLoadingTools] = useState(false);

  // ==========================================================
  // SHIFT MODAL
  // ==========================================================

  const [shiftUser, setShiftUser] = useState(null);
  const [savingShift, setSavingShift] = useState(false);

  const [shiftForm, setShiftForm] = useState({
    shift_name: 'Morning Shift',
    start_time: '08:00',
    end_time: '16:00',
    effective_from: getTodayDate(),
    notes: '',
  });

  // ==========================================================
  // DUTY STATUS MODAL
  // ==========================================================

  const [dutyUser, setDutyUser] = useState(null);
  const [savingDuty, setSavingDuty] = useState(false);

  const [dutyForm, setDutyForm] = useState({
    duty_date: getTodayDate(),
    status: 'on_duty',
    notes: '',
  });

  // ==========================================================
  // HISTORY MODAL
  // ==========================================================

  const [historyUser, setHistoryUser] = useState(null);

  const [historyData, setHistoryData] = useState({
    shifts: [],
    duties: [],
  });

  const [loadingHistory, setLoadingHistory] = useState(false);

  // ==========================================================
  // INITIAL LOAD
  // ==========================================================

  useEffect(() => {
    fetchAllData();
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  // ==========================================================
  // FETCH ALL DATA
  // ==========================================================

  const fetchAllData = async (showRefreshLoader = false) => {
    if (showRefreshLoader) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError('');

    try {
      const [
        usersResponse,
        dutyStaffResponse,
        dutySummaryResponse,
      ] = await Promise.all([
        API.get('/user/all'),

        API.get('/duty/staff', {
          params: {
            year: selectedYear,
            month: selectedMonth,
          },
        }),

        API.get('/duty/summary'),
      ]);

      const usersData = Array.isArray(usersResponse.data)
        ? usersResponse.data
        : usersResponse.data?.users || [];

      setUsers(usersData);

      const staffData = Array.isArray(dutyStaffResponse.data)
        ? dutyStaffResponse.data
        : dutyStaffResponse.data?.staff || [];

      setDutyStaff(staffData);

      setDutySummary({
        totalStaff: Number(dutySummaryResponse.data?.totalStaff || 0),
        onDutyToday: Number(dutySummaryResponse.data?.onDutyToday || 0),
        onLeaveToday: Number(dutySummaryResponse.data?.onLeaveToday || 0),
        offToday: Number(dutySummaryResponse.data?.offToday || 0),
      });
    } catch (err) {
      console.error('❌ STAFF RECORD DATA ERROR:', err);

      setError(getErrorMessage(err));

      try {
        const usersResponse = await API.get('/user/all');

        const usersData = Array.isArray(usersResponse.data)
          ? usersResponse.data
          : usersResponse.data?.users || [];

        setUsers(usersData);
      } catch (userError) {
        console.error('❌ USERS FALLBACK ERROR:', userError);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ==========================================================
  // DUTY MAP
  // ==========================================================

  const dutyMap = useMemo(() => {
    const map = new Map();

    dutyStaff.forEach((staff) => {
      map.set(Number(staff.id), staff);
    });

    return map;
  }, [dutyStaff]);

  // ==========================================================
  // MERGED USERS
  // ==========================================================

  const mergedUsers = useMemo(() => {
    return users.map((user) => {
      const duty = dutyMap.get(Number(user.id)) || null;

      return {
        ...user,

        currentShift: duty?.currentShift || null,

        todayDuty: duty?.todayDuty || null,

        monthlySummary: duty?.monthlySummary || {
          dutyDays: 0,
          leaveDays: 0,
          offDays: 0,
          recordedDays: 0,
        },
      };
    });
  }, [users, dutyMap]);

  // ==========================================================
  // SEARCH + FILTER
  // ==========================================================

  const filteredUsers = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return mergedUsers.filter((user) => {
      const name = String(user.name || '').toLowerCase();
      const email = String(user.email || '').toLowerCase();
      const phone = String(user.phone || '').toLowerCase();
      const role = String(user.role || '').toLowerCase();

      const matchesSearch =
        !searchValue ||
        name.includes(searchValue) ||
        email.includes(searchValue) ||
        phone.includes(searchValue) ||
        String(user.id).includes(searchValue);

      const matchesRole =
        roleFilter === 'all' ||
        role === roleFilter.toLowerCase();

      return matchesSearch && matchesRole;
    });
  }, [mergedUsers, search, roleFilter]);

  // ==========================================================
  // PAGINATION
  // ==========================================================

  const totalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / usersPerPage)
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const indexOfLast = currentPage * usersPerPage;
  const indexOfFirst = indexOfLast - usersPerPage;

  const currentUsers = filteredUsers.slice(
    indexOfFirst,
    indexOfLast
  );

  // ==========================================================
  // FETCH USER TOOLS
  // ==========================================================

  const fetchUserTools = async (userId) => {
    setLoadingTools(true);

    try {
      const response = await API.get(`/tools/user/${userId}`);
      setAssignedTools(normalizeToolsResponse(response.data));
    } catch (err) {
      console.error('❌ USER TOOLS ERROR:', err);
      setAssignedTools([]);
    } finally {
      setLoadingTools(false);
    }
  };

  // ==========================================================
  // VIEW DETAILS
  // ==========================================================

  const handleViewDetails = async (user) => {
    const latestUser =
      mergedUsers.find(
        (item) => Number(item.id) === Number(user.id)
      ) || user;

    setViewUser(latestUser);
    setAssignedTools([]);

    await fetchUserTools(latestUser.id);
  };

  // ==========================================================
  // PRINT
  // ==========================================================

  const handlePrint = () => {
    window.print();
  };

  // ==========================================================
  // DELETE USER
  // ==========================================================

  const deleteUser = async (id) => {
    const confirmed = window.confirm(
      'Delete this user? This action cannot be undone.'
    );

    if (!confirmed) return;

    try {
      await API.delete(`/user/${id}`);
      await fetchAllData();
      window.alert('User deleted successfully.');
    } catch (err) {
      console.error('❌ DELETE USER ERROR:', err);
      window.alert(getErrorMessage(err));
    }
  };

  // ==========================================================
  // USER STATUS
  // ==========================================================

  const updateUserStatus = async (user, newStatus) => {
    try {
      const formData = new FormData();

      formData.append('name', user.name || '');
      formData.append('email', user.email || '');
      formData.append('role', user.role || '');
      formData.append('phone', user.phone || '');
      formData.append('maritalStatus', user.maritalStatus || '');
      formData.append('address', user.address || '');
      formData.append('backgroundInfo', user.backgroundInfo || '');
      formData.append('status', newStatus);

      await API.put(`/user/${user.id}`, formData);

      setUsers((previousUsers) =>
        previousUsers.map((item) =>
          Number(item.id) === Number(user.id)
            ? {
                ...item,
                status: newStatus,
              }
            : item
        )
      );
    } catch (err) {
      console.error('❌ USER STATUS UPDATE ERROR:', err);
      window.alert(getErrorMessage(err));
    }
  };

  // ==========================================================
  // IMAGE PREVIEW
  // ==========================================================

  const handleImage = (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      window.alert('Please select a valid image file.');
      return;
    }

    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  };

  // ==========================================================
  // OPEN / CLOSE EDIT USER
  // ==========================================================

  const openEditUser = (user) => {
    if (preview) {
      URL.revokeObjectURL(preview);
    }

    const latestUser =
      mergedUsers.find(
        (item) => Number(item.id) === Number(user.id)
      ) || user;

    setPreview(null);
    setImageFile(null);

    setSelectedUser({
      ...latestUser,
    });
  };

  const closeEditUser = () => {
    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setSelectedUser(null);
    setImageFile(null);
    setPreview(null);
  };

  // ==========================================================
  // UPDATE USER
  // ==========================================================

  const updateUser = async () => {
    if (!selectedUser) return;

    if (
      !selectedUser.name?.trim() ||
      !selectedUser.email?.trim()
    ) {
      window.alert('Name and email are required.');
      return;
    }

    setUpdatingUser(true);

    try {
      const formData = new FormData();

      formData.append('name', selectedUser.name || '');
      formData.append('email', selectedUser.email || '');
      formData.append('role', selectedUser.role || '');
      formData.append('phone', selectedUser.phone || '');
      formData.append(
        'maritalStatus',
        selectedUser.maritalStatus || ''
      );
      formData.append('address', selectedUser.address || '');
      formData.append(
        'backgroundInfo',
        selectedUser.backgroundInfo || ''
      );
      formData.append(
        'status',
        selectedUser.status || 'active'
      );

      if (imageFile) {
        formData.append('profile_pic', imageFile);
      }

      await API.put(`/user/${selectedUser.id}`, formData);

      closeEditUser();
      await fetchAllData();

      window.alert('User updated successfully.');
    } catch (err) {
      console.error('❌ UPDATE USER ERROR:', err);
      window.alert(getErrorMessage(err));
    } finally {
      setUpdatingUser(false);
    }
  };

  // ==========================================================
  // SHIFT
  // ==========================================================

  const openShiftModal = (user) => {
    const latestUser =
      mergedUsers.find(
        (item) => Number(item.id) === Number(user.id)
      ) || user;

    setShiftUser(latestUser);

    setShiftForm({
      shift_name:
        latestUser.currentShift?.shift_name || 'Morning Shift',

      start_time:
        latestUser.currentShift?.start_time?.slice(0, 5) || '08:00',

      end_time:
        latestUser.currentShift?.end_time?.slice(0, 5) || '16:00',

      effective_from: getTodayDate(),

      notes: latestUser.currentShift?.notes || '',
    });
  };

  const assignShift = async () => {
    if (!shiftUser) return;

    if (
      !shiftForm.shift_name.trim() ||
      !shiftForm.start_time ||
      !shiftForm.end_time ||
      !shiftForm.effective_from
    ) {
      window.alert('Please complete all required shift fields.');
      return;
    }

    setSavingShift(true);

    try {
      await API.post('/duty/assign-shift', {
        user_id: shiftUser.id,
        shift_name: shiftForm.shift_name,
        start_time: shiftForm.start_time,
        end_time: shiftForm.end_time,
        effective_from: shiftForm.effective_from,
        notes: shiftForm.notes || '',
      });

      setShiftUser(null);
      await fetchAllData();

      window.alert('Shift assigned successfully.');
    } catch (err) {
      console.error('❌ ASSIGN SHIFT ERROR:', err);
      window.alert(getErrorMessage(err));
    } finally {
      setSavingShift(false);
    }
  };

  // ==========================================================
  // DUTY STATUS
  // ==========================================================

  const openDutyModal = (user) => {
    const latestUser =
      mergedUsers.find(
        (item) => Number(item.id) === Number(user.id)
      ) || user;

    setDutyUser(latestUser);

    setDutyForm({
      duty_date: latestUser.todayDuty?.duty_date || getTodayDate(),
      status: latestUser.todayDuty?.status || 'on_duty',
      notes: latestUser.todayDuty?.notes || '',
    });
  };

  const saveDutyStatus = async () => {
    if (!dutyUser) return;

    setSavingDuty(true);

    try {
      await API.post('/duty/mark-status', {
        user_id: dutyUser.id,
        duty_date: dutyForm.duty_date,
        status: dutyForm.status,
        notes: dutyForm.notes || '',
      });

      setDutyUser(null);
      await fetchAllData();

      window.alert('Duty status saved successfully.');
    } catch (err) {
      console.error('❌ SAVE DUTY STATUS ERROR:', err);
      window.alert(getErrorMessage(err));
    } finally {
      setSavingDuty(false);
    }
  };

  // ==========================================================
  // HISTORY
  // ==========================================================

  const openHistory = async (user) => {
    const latestUser =
      mergedUsers.find(
        (item) => Number(item.id) === Number(user.id)
      ) || user;

    setHistoryUser(latestUser);

    setHistoryData({
      shifts: [],
      duties: [],
    });

    setLoadingHistory(true);

    try {
      const response = await API.get(
        `/duty/user/${latestUser.id}/history`
      );

      setHistoryData({
        shifts: Array.isArray(response.data?.shifts)
          ? response.data.shifts
          : [],

        duties: Array.isArray(response.data?.duties)
          ? response.data.duties
          : [],
      });
    } catch (err) {
      console.error('❌ DUTY HISTORY ERROR:', err);
      window.alert(getErrorMessage(err));
    } finally {
      setLoadingHistory(false);
    }
  };

  // ==========================================================
  // STYLES / LABELS
  // ==========================================================

  const roleColor = (role) => {
    switch (String(role || '').toLowerCase()) {
      case 'admin':
        return 'bg-blue-500/20 text-blue-400';

      case 'superadmin':
        return 'bg-purple-500/20 text-purple-400';

      case 'electrician':
        return 'bg-yellow-500/20 text-yellow-400';

      case 'cro':
        return 'bg-cyan-500/20 text-cyan-400';

      default:
        return 'bg-green-500/20 text-green-400';
    }
  };

  const dutyStatusStyle = (status) => {
    switch (status) {
      case 'on_duty':
        return 'bg-green-500/20 text-green-400 border-green-500/30';

      case 'leave':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';

      case 'off_duty':
        return 'bg-red-500/20 text-red-400 border-red-500/30';

      default:
        return 'bg-slate-700/50 text-gray-400 border-white/10';
    }
  };

  const dutyStatusLabel = (status) => {
    switch (status) {
      case 'on_duty':
        return 'On Duty';

      case 'off_duty':
        return 'Off Duty';

      case 'leave':
        return 'Leave';

      default:
        return 'Not Marked';
    }
  };

  const yearOptions = [];

  for (
    let year = getCurrentYear() - 5;
    year <= getCurrentYear() + 2;
    year += 1
  ) {
    yearOptions.push(year);
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="p-4 md:p-6 xl:p-8 text-white min-w-0">

      {/* HEADER */}

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            Staff Records
          </h1>

          <p className="text-gray-500 text-sm mt-1">
            Manage staff profiles, shifts, duty status and monthly attendance
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => fetchAllData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-xl transition disabled:opacity-50"
          >
            <RefreshCw
              size={17}
              className={refreshing ? 'animate-spin' : ''}
            />
            Refresh
          </button>

          <div className="bg-yellow-500 px-4 py-3 rounded-xl text-black font-bold">
            Total: {filteredUsers.length}
          </div>
        </div>
      </div>

      {/* ERROR */}

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
          {error}
        </div>
      )}

      {/* SUMMARY CARDS */}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          icon={<BriefcaseBusiness size={21} />}
          label="Total Staff"
          value={dutySummary.totalStaff}
          iconClass="bg-blue-500/10 text-blue-400"
        />

        <SummaryCard
          icon={<UserCheck size={21} />}
          label="On Duty Today"
          value={dutySummary.onDutyToday}
          iconClass="bg-green-500/10 text-green-400"
        />

        <SummaryCard
          icon={<Palmtree size={21} />}
          label="On Leave Today"
          value={dutySummary.onLeaveToday}
          iconClass="bg-orange-500/10 text-orange-400"
        />

        <SummaryCard
          icon={<UserX size={21} />}
          label="Off Today"
          value={dutySummary.offToday}
          iconClass="bg-red-500/10 text-red-400"
        />
      </div>

      {/* FILTERS */}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_320px] gap-4 mb-6">
        <input
          value={search}
          placeholder="Search by ID, name, email or phone..."
          className="px-4 py-3 rounded-xl bg-slate-800 text-white placeholder:text-gray-500 w-full outline-none border border-transparent focus:border-yellow-500"
          onChange={(event) => {
            setSearch(event.target.value);
            setCurrentPage(1);
          }}
        />

        <select
          value={roleFilter}
          className="px-4 py-3 rounded-xl bg-slate-800 text-white outline-none w-full"
          onChange={(event) => {
            setRoleFilter(event.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="superadmin">Super Admin</option>
          <option value="electrician">Electrician</option>
          <option value="cro">CRO</option>
        </select>

        <div className="grid grid-cols-[1fr_110px] gap-2">
          <select
            value={selectedMonth}
            onChange={(event) => {
              setSelectedMonth(Number(event.target.value));
              setCurrentPage(1);
            }}
            className="px-4 py-3 rounded-xl bg-slate-800 text-white outline-none min-w-0"
          >
            <option value={1}>January</option>
            <option value={2}>February</option>
            <option value={3}>March</option>
            <option value={4}>April</option>
            <option value={5}>May</option>
            <option value={6}>June</option>
            <option value={7}>July</option>
            <option value={8}>August</option>
            <option value={9}>September</option>
            <option value={10}>October</option>
            <option value={11}>November</option>
            <option value={12}>December</option>
          </select>

          <select
            value={selectedYear}
            onChange={(event) => {
              setSelectedYear(Number(event.target.value));
              setCurrentPage(1);
            }}
            className="px-3 py-3 rounded-xl bg-slate-800 text-white outline-none min-w-0"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* LOADING */}

      {loading && (
        <div className="flex items-center gap-3 text-yellow-500 py-10 justify-center">
          <Loader2 size={22} className="animate-spin" />
          Loading staff records...
        </div>
      )}

      {/* TABLE */}

      {!loading && (
        <div className="bg-slate-900/40 rounded-2xl border border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1300px] w-full table-auto">
              <thead>
                <tr className="text-left text-gray-400 border-b border-white/5 bg-slate-900/40">
                  <th className="p-4 w-[80px]">ID</th>
                  <th className="p-4 w-[80px]">Photo</th>
                  <th className="p-4 min-w-[230px]">Staff</th>
                  <th className="p-4 min-w-[150px]">Role / Status</th>
                  <th className="p-4 min-w-[190px]">Current Shift</th>
                  <th className="p-4 min-w-[130px]">Today Duty</th>
                  <th className="p-4 text-center min-w-[240px]">
                    Monthly Record
                  </th>
                  <th className="p-4 text-center min-w-[300px]">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {currentUsers.map((user) => {
                  const monthly = user.monthlySummary || {};

                  return (
                    <tr
                      key={user.id}
                      className={`border-t border-white/5 hover:bg-white/[0.025] transition ${
                        user.status === 'inactive'
                          ? 'bg-red-500/10 border-l-4 border-l-red-500'
                          : ''
                      }`}
                    >
                      <td className="p-4 text-yellow-500 font-semibold align-middle">
                        #{user.id}
                      </td>

                      {/* ONLY ONE PROFILE PICTURE */}
                      <td className="p-4 align-middle">
                        <UserAvatar
                          user={user}
                          className="w-12 h-12 rounded-full border-2 border-yellow-500/40 bg-slate-800"
                          fallbackClassName="text-sm text-yellow-400"
                        />
                      </td>

                      {/* DUPLICATE AVATAR REMOVED */}
                      <td className="p-4 align-middle">
                        <div className="min-w-0">
                          <p className="text-white font-semibold truncate max-w-[230px]">
                            {user.name || 'N/A'}
                          </p>

                          <p className="text-gray-400 text-xs mt-1 truncate max-w-[230px]">
                            {user.email || 'N/A'}
                          </p>

                          {user.phone && (
                            <p className="text-gray-500 text-xs mt-1">
                              {user.phone}
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="p-4 align-middle">
                        <div className="flex flex-col items-start gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-xs ${roleColor(
                              user.role
                            )}`}
                          >
                            {user.role || 'N/A'}
                          </span>

                          <select
                            value={user.status || 'active'}
                            onChange={(event) =>
                              updateUserStatus(user, event.target.value)
                            }
                            className={`text-[10px] px-3 py-1 rounded-full font-bold cursor-pointer outline-none border border-white/10 ${
                              user.status === 'inactive'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-green-500/20 text-green-400'
                            }`}
                          >
                            <option value="active">🟢 Active</option>
                            <option value="inactive">🔴 Inactive</option>
                          </select>
                        </div>
                      </td>

                      <td className="p-4 align-middle">
                        {user.currentShift ? (
                          <div>
                            <p className="text-white font-medium text-sm">
                              {user.currentShift.shift_name}
                            </p>

                            <p className="text-blue-400 text-xs mt-1 flex items-center gap-1">
                              <Clock3 size={12} />
                              {formatTime(user.currentShift.start_time)}
                              {' - '}
                              {formatTime(user.currentShift.end_time)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-500 text-xs">
                            No shift assigned
                          </span>
                        )}
                      </td>

                      <td className="p-4 align-middle">
                        <button
                          onClick={() => openDutyModal(user)}
                          className={`px-3 py-2 rounded-xl text-xs border transition hover:scale-[1.02] ${dutyStatusStyle(
                            user.todayDuty?.status
                          )}`}
                        >
                          {dutyStatusLabel(user.todayDuty?.status)}
                        </button>
                      </td>

                      <td className="p-4 align-middle">
                        <div className="grid grid-cols-3 gap-2 min-w-[220px]">
                          <MiniStat
                            label="Duty"
                            value={monthly.dutyDays || 0}
                            className="text-green-400"
                          />

                          <MiniStat
                            label="Leave"
                            value={monthly.leaveDays || 0}
                            className="text-orange-400"
                          />

                          <MiniStat
                            label="Off"
                            value={monthly.offDays || 0}
                            className="text-red-400"
                          />
                        </div>
                      </td>

                      <td className="p-4 align-middle">
                        <div className="flex items-center gap-2 justify-center flex-nowrap">
                          <button
                            title="Quick View"
                            onClick={() => handleViewDetails(user)}
                            className="w-9 h-9 shrink-0 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white flex items-center justify-center transition"
                          >
                            <Eye size={17} />
                          </button>

                          <button
                            title="Full Details"
                            onClick={() => navigate(`/user/${user.id}`)}
                            className="text-xs bg-green-500/20 text-green-400 px-3 h-9 rounded-lg hover:bg-green-500 hover:text-black transition whitespace-nowrap"
                          >
                            View Details
                          </button>

                          <button
                            title="Assign / Change Shift"
                            onClick={() => openShiftModal(user)}
                            className="w-9 h-9 shrink-0 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500 hover:text-black flex items-center justify-center transition"
                          >
                            <Clock3 size={17} />
                          </button>

                          <button
                            title="Duty History"
                            onClick={() => openHistory(user)}
                            className="w-9 h-9 shrink-0 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500 hover:text-white flex items-center justify-center transition"
                          >
                            <History size={17} />
                          </button>

                          <button
                            title="Edit User"
                            onClick={() => openEditUser(user)}
                            className="w-9 h-9 shrink-0 rounded-lg bg-white/5 text-gray-300 hover:bg-yellow-500 hover:text-black flex items-center justify-center transition"
                          >
                            <Edit size={17} />
                          </button>

                          <button
                            title="Delete User"
                            onClick={() => deleteUser(user.id)}
                            className="w-9 h-9 shrink-0 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <p className="text-center py-12 text-gray-500">
              No users found
            </p>
          )}
        </div>
      )}

      {/* PAGINATION */}

      {!loading && filteredUsers.length > 0 && (
        <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
          <button
            disabled={currentPage === 1}
            onClick={() =>
              setCurrentPage((page) => Math.max(1, page - 1))
            }
            className="w-10 h-10 rounded-lg bg-slate-800 text-white flex items-center justify-center disabled:opacity-30"
          >
            <ChevronLeft size={18} />
          </button>

          {Array.from(
            { length: totalPages },
            (_, index) => index + 1
          ).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`w-10 h-10 rounded-lg ${
                currentPage === page
                  ? 'bg-yellow-500 text-black'
                  : 'bg-slate-800 text-white'
              }`}
            >
              {page}
            </button>
          ))}

          <button
            disabled={currentPage === totalPages}
            onClick={() =>
              setCurrentPage((page) =>
                Math.min(totalPages, page + 1)
              )
            }
            className="w-10 h-10 rounded-lg bg-slate-800 text-white flex items-center justify-center disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* QUICK VIEW + PRINT MODAL */}

      {viewUser &&
        createPortal(
          <div
            id="staff-report-overlay"
            className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-sm overflow-y-auto p-3 md:p-6"
          >
            <div className="min-h-full flex items-start md:items-center justify-center py-4 md:py-8">
              <div
                id="printable-area"
                className="staff-print-report bg-white text-black w-full max-w-5xl rounded-2xl shadow-2xl relative overflow-hidden"
              >
                <div className="report-header flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-5 md:px-8 py-6 border-b border-gray-200">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-gray-950">
                      Staff Profile Report
                    </h2>

                    <p className="text-sm text-gray-500 mt-1">
                      Complete profile, duty, shift and assigned tools record
                    </p>
                  </div>

                  <div className="print:hidden flex items-center gap-3 md:pr-10">
                    <button
                      type="button"
                      onClick={handlePrint}
                      className="flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-black px-5 py-3 rounded-xl font-bold transition"
                    >
                      <Printer size={18} />
                      Print Record
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setViewUser(null);
                      setAssignedTools([]);
                    }}
                    className="print:hidden absolute top-4 right-4 w-10 h-10 rounded-full bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-500 flex items-center justify-center transition"
                  >
                    <X size={22} />
                  </button>
                </div>

                <div className="report-body px-5 md:px-8 py-7">
                  <section className="profile-section">
                    <div className="flex flex-col md:flex-row gap-7 items-start">
                      <div className="shrink-0 mx-auto md:mx-0">
                        <UserAvatar
                          user={viewUser}
                          className="report-profile-image w-32 h-32 md:w-36 md:h-36 rounded-2xl border border-gray-200 bg-gray-100"
                          fallbackClassName="text-3xl text-gray-600"
                        />
                      </div>

                      <div className="flex-1 w-full min-w-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                          <ReportInfo label="ID" value={`#${viewUser.id}`} />
                          <ReportInfo label="Name" value={viewUser.name || 'N/A'} />
                          <ReportInfo label="Email" value={viewUser.email || 'N/A'} />
                          <ReportInfo label="Role" value={viewUser.role || 'N/A'} />
                          <ReportInfo label="Phone" value={viewUser.phone || 'N/A'} />
                          <ReportInfo
                            label="Account Status"
                            value={viewUser.status || 'active'}
                          />
                          <ReportInfo
                            label="Marital Status"
                            value={viewUser.maritalStatus || 'N/A'}
                          />
                          <ReportInfo
                            label="Address"
                            value={viewUser.address || 'N/A'}
                          />
                        </div>

                        <div className="mt-5">
                          <ReportInfo
                            label="Background"
                            value={viewUser.backgroundInfo || 'N/A'}
                          />
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="report-section mt-8">
                    <div className="border-b border-gray-200 pb-3 mb-4">
                      <h3 className="text-xl font-bold text-gray-950">
                        Duty & Shift Information
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <ReportStat
                        label="Current Shift"
                        value={viewUser.currentShift?.shift_name || 'N/A'}
                      />

                      <ReportStat
                        label="Shift Time"
                        value={
                          viewUser.currentShift
                            ? `${formatTime(
                                viewUser.currentShift.start_time
                              )} - ${formatTime(
                                viewUser.currentShift.end_time
                              )}`
                            : 'N/A'
                        }
                      />

                      <ReportStat
                        label="Today Status"
                        value={dutyStatusLabel(viewUser.todayDuty?.status)}
                      />

                      <ReportStat
                        label="Duty Days"
                        value={viewUser.monthlySummary?.dutyDays || 0}
                      />

                      <ReportStat
                        label="Leave Days"
                        value={viewUser.monthlySummary?.leaveDays || 0}
                      />

                      <ReportStat
                        label="Off Days"
                        value={viewUser.monthlySummary?.offDays || 0}
                      />

                      <ReportStat
                        label="Recorded Days"
                        value={viewUser.monthlySummary?.recordedDays || 0}
                      />

                      <ReportStat
                        label="Report Period"
                        value={`${selectedMonth}/${selectedYear}`}
                      />
                    </div>
                  </section>

                  <section className="report-section mt-8">
                    <div className="border-b border-gray-200 pb-3 mb-4">
                      <h3 className="text-xl font-bold text-gray-950">
                        Assigned Tools History
                      </h3>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="report-tools-table w-full min-w-[600px] text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-100 text-gray-950">
                            <th className="border border-gray-200 p-3">
                              Tool Name
                            </th>
                            <th className="border border-gray-200 p-3">
                              Category
                            </th>
                            <th className="border border-gray-200 p-3">
                              Qty
                            </th>
                            <th className="border border-gray-200 p-3">
                              Date
                            </th>
                          </tr>
                        </thead>

                        <tbody className="text-gray-800">
                          {loadingTools ? (
                            <tr>
                              <td
                                colSpan="4"
                                className="border border-gray-200 p-6 text-center text-gray-500"
                              >
                                Loading tools...
                              </td>
                            </tr>
                          ) : assignedTools.length > 0 ? (
                            assignedTools.map((tool, index) => (
                              <tr
                                key={
                                  tool.id ||
                                  `${tool.toolName || tool.tool_name}-${index}`
                                }
                              >
                                <td className="border border-gray-200 p-3">
                                  {tool.toolName || tool.tool_name || 'N/A'}
                                </td>

                                <td className="border border-gray-200 p-3">
                                  {tool.category || 'N/A'}
                                </td>

                                <td className="border border-gray-200 p-3">
                                  {tool.quantity || 0}
                                </td>

                                <td className="border border-gray-200 p-3">
                                  {formatDate(tool.date)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan="4"
                                className="border border-gray-200 p-6 text-center text-gray-500"
                              >
                                No tools assigned yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <div className="report-footer mt-10 pt-5 border-t border-gray-200 text-xs text-gray-400 text-center italic">
                    Generated by System — {new Date().toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* EDIT USER MODAL */}

      {selectedUser && (
        <ModalOverlay>
          <div className="bg-slate-900 text-white border border-white/10 p-6 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto relative">
            <ModalClose onClick={closeEditUser} />

            <div className="flex items-center gap-4 mb-6 pr-10">
              <UserAvatar
                user={selectedUser}
                src={preview || undefined}
                className="w-16 h-16 rounded-full border-2 border-yellow-500 bg-slate-800"
                fallbackClassName="text-lg text-yellow-400"
              />

              <div>
                <h2 className="text-xl font-bold text-white">
                  Edit User
                </h2>

                <p className="text-yellow-500 text-sm mt-1">
                  ID: #{selectedUser.id}
                </p>
              </div>
            </div>

            <FormLabel label="Name" />

            <input
              className="w-full mb-3 p-3 rounded bg-slate-800 text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-yellow-500"
              value={selectedUser.name || ''}
              onChange={(event) =>
                setSelectedUser({
                  ...selectedUser,
                  name: event.target.value,
                })
              }
            />

            <FormLabel label="Email" />

            <input
              type="email"
              className="w-full mb-3 p-3 rounded bg-slate-800 text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-yellow-500"
              value={selectedUser.email || ''}
              onChange={(event) =>
                setSelectedUser({
                  ...selectedUser,
                  email: event.target.value,
                })
              }
            />

            <FormLabel label="Role" />

            <select
              className="w-full mb-3 p-3 rounded bg-slate-800 text-white outline-none"
              value={selectedUser.role || ''}
              onChange={(event) =>
                setSelectedUser({
                  ...selectedUser,
                  role: event.target.value,
                })
              }
            >
              <option value="admin">Admin</option>
              <option value="superadmin">Super Admin</option>
              <option value="electrician">Electrician</option>
              <option value="cro">CRO</option>
            </select>

            <FormLabel label="Phone" />

            <input
              className="w-full mb-3 p-3 rounded bg-slate-800 text-white placeholder:text-gray-500 outline-none"
              placeholder="Phone"
              value={selectedUser.phone || ''}
              onChange={(event) =>
                setSelectedUser({
                  ...selectedUser,
                  phone: event.target.value,
                })
              }
            />

            <FormLabel label="Marital Status" />

            <select
              className="w-full mb-3 p-3 rounded bg-slate-800 text-white outline-none"
              value={selectedUser.maritalStatus || 'Single'}
              onChange={(event) =>
                setSelectedUser({
                  ...selectedUser,
                  maritalStatus: event.target.value,
                })
              }
            >
              <option value="Single">Single</option>
              <option value="Married">Married</option>
            </select>

            <FormLabel label="Address" />

            <textarea
              rows={3}
              className="w-full mb-3 p-3 rounded bg-slate-800 text-white placeholder:text-gray-500 outline-none resize-none"
              placeholder="Address"
              value={selectedUser.address || ''}
              onChange={(event) =>
                setSelectedUser({
                  ...selectedUser,
                  address: event.target.value,
                })
              }
            />

            <FormLabel label="Background Information" />

            <textarea
              rows={4}
              className="w-full mb-3 p-3 rounded bg-slate-800 text-white placeholder:text-gray-500 outline-none resize-none"
              placeholder="Background Info"
              value={selectedUser.backgroundInfo || ''}
              onChange={(event) =>
                setSelectedUser({
                  ...selectedUser,
                  backgroundInfo: event.target.value,
                })
              }
            />

            <FormLabel label="Profile Photo" />

            <div className="mb-5 p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <UserAvatar
                user={selectedUser}
                src={preview || undefined}
                className="w-24 h-24 rounded-full mb-3 border-2 border-yellow-500 bg-slate-800"
                fallbackClassName="text-xl text-yellow-400"
              />

              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  handleImage(event.target.files?.[0])
                }
                className="text-sm text-gray-300 max-w-full"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={closeEditUser}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white"
              >
                Cancel
              </button>

              <button
                disabled={updatingUser}
                onClick={updateUser}
                className="flex items-center gap-2 bg-yellow-500 px-4 py-2 rounded-lg text-black font-bold disabled:opacity-50"
              >
                {updatingUser ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Save size={17} />
                )}

                {updatingUser ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ASSIGN SHIFT MODAL */}

      {shiftUser && (
        <ModalOverlay>
          <div className="bg-slate-900 text-white border border-white/10 p-6 rounded-2xl w-full max-w-lg relative">
            <ModalClose onClick={() => setShiftUser(null)} />

            <UserModalHeader
              user={shiftUser}
              title="Assign / Change Shift"
              subtitle={`Staff ID #${shiftUser.id}`}
            />

            <div className="mt-6">
              <FormLabel label="Shift Name" />

              <input
                value={shiftForm.shift_name}
                onChange={(event) =>
                  setShiftForm({
                    ...shiftForm,
                    shift_name: event.target.value,
                  })
                }
                placeholder="Morning Shift"
                className="w-full mb-4 p-3 rounded-xl bg-slate-800 text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-yellow-500"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FormLabel label="Start Time" />

                  <input
                    type="time"
                    value={shiftForm.start_time}
                    onChange={(event) =>
                      setShiftForm({
                        ...shiftForm,
                        start_time: event.target.value,
                      })
                    }
                    className="w-full mb-4 p-3 rounded-xl bg-slate-800 text-white outline-none"
                  />
                </div>

                <div>
                  <FormLabel label="End Time" />

                  <input
                    type="time"
                    value={shiftForm.end_time}
                    onChange={(event) =>
                      setShiftForm({
                        ...shiftForm,
                        end_time: event.target.value,
                      })
                    }
                    className="w-full mb-4 p-3 rounded-xl bg-slate-800 text-white outline-none"
                  />
                </div>
              </div>

              <FormLabel label="Effective From" />

              <input
                type="date"
                value={shiftForm.effective_from}
                onChange={(event) =>
                  setShiftForm({
                    ...shiftForm,
                    effective_from: event.target.value,
                  })
                }
                className="w-full mb-4 p-3 rounded-xl bg-slate-800 text-white outline-none"
              />

              <FormLabel label="Notes" />

              <textarea
                rows={3}
                value={shiftForm.notes}
                onChange={(event) =>
                  setShiftForm({
                    ...shiftForm,
                    notes: event.target.value,
                  })
                }
                placeholder="Optional notes..."
                className="w-full mb-5 p-3 rounded-xl bg-slate-800 text-white placeholder:text-gray-500 outline-none resize-none"
              />

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShiftUser(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700"
                >
                  Cancel
                </button>

                <button
                  disabled={savingShift}
                  onClick={assignShift}
                  className="flex items-center gap-2 bg-yellow-500 text-black px-4 py-2 rounded-lg font-bold disabled:opacity-50"
                >
                  {savingShift ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <Save size={17} />
                  )}

                  {savingShift ? 'Saving...' : 'Assign Shift'}
                </button>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* DUTY STATUS MODAL */}

      {dutyUser && (
        <ModalOverlay>
          <div className="bg-slate-900 text-white border border-white/10 p-6 rounded-2xl w-full max-w-lg relative">
            <ModalClose onClick={() => setDutyUser(null)} />

            <UserModalHeader
              user={dutyUser}
              title="Mark Duty Status"
              subtitle={`Staff ID #${dutyUser.id}`}
            />

            <div className="mt-6">
              <FormLabel label="Duty Date" />

              <input
                type="date"
                value={dutyForm.duty_date}
                onChange={(event) =>
                  setDutyForm({
                    ...dutyForm,
                    duty_date: event.target.value,
                  })
                }
                className="w-full mb-4 p-3 rounded-xl bg-slate-800 text-white outline-none"
              />

              <FormLabel label="Duty Status" />

              <select
                value={dutyForm.status}
                onChange={(event) =>
                  setDutyForm({
                    ...dutyForm,
                    status: event.target.value,
                  })
                }
                className="w-full mb-4 p-3 rounded-xl bg-slate-800 text-white outline-none"
              >
                <option value="on_duty">🟢 On Duty</option>
                <option value="off_duty">🔴 Off Duty</option>
                <option value="leave">🟠 Leave</option>
              </select>

              <FormLabel label="Notes" />

              <textarea
                rows={4}
                value={dutyForm.notes}
                onChange={(event) =>
                  setDutyForm({
                    ...dutyForm,
                    notes: event.target.value,
                  })
                }
                placeholder="Optional duty notes..."
                className="w-full mb-5 p-3 rounded-xl bg-slate-800 text-white placeholder:text-gray-500 outline-none resize-none"
              />

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDutyUser(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700"
                >
                  Cancel
                </button>

                <button
                  disabled={savingDuty}
                  onClick={saveDutyStatus}
                  className="flex items-center gap-2 bg-yellow-500 text-black px-4 py-2 rounded-lg font-bold disabled:opacity-50"
                >
                  {savingDuty ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <Save size={17} />
                  )}

                  {savingDuty ? 'Saving...' : 'Save Duty'}
                </button>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* HISTORY MODAL */}

      {historyUser && (
        <ModalOverlay>
          <div className="bg-slate-900 text-white border border-white/10 p-5 md:p-6 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto relative">
            <ModalClose onClick={() => setHistoryUser(null)} />

            <div className="mb-7 pr-10">
              <UserModalHeader
                user={historyUser}
                title="Duty & Shift History"
                subtitle={`Staff ID #${historyUser.id}`}
              />
            </div>

            {loadingHistory ? (
              <div className="py-16 flex items-center justify-center gap-3 text-yellow-500">
                <Loader2 size={22} className="animate-spin" />
                Loading history...
              </div>
            ) : (
              <>
                <h3 className="font-bold text-lg mb-3 text-white">
                  Shift History
                </h3>

                <div className="overflow-x-auto mb-8">
                  <table className="w-full min-w-[700px] text-sm text-white">
                    <thead>
                      <tr className="text-left text-gray-300 border-b border-white/10">
                        <th className="p-3">Shift</th>
                        <th className="p-3">Time</th>
                        <th className="p-3">Effective From</th>
                        <th className="p-3">Effective To</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {historyData.shifts.length > 0 ? (
                        historyData.shifts.map((shift) => (
                          <tr
                            key={shift.id}
                            className="border-b border-white/5 text-gray-200"
                          >
                            <td className="p-3">
                              {shift.shift_name}
                            </td>

                            <td className="p-3 text-blue-400">
                              {formatTime(shift.start_time)} -{' '}
                              {formatTime(shift.end_time)}
                            </td>

                            <td className="p-3">
                              {formatDate(shift.effective_from)}
                            </td>

                            <td className="p-3">
                              {formatDate(shift.effective_to)}
                            </td>

                            <td className="p-3">
                              <span
                                className={`px-3 py-1 rounded-full text-xs ${
                                  Number(shift.is_active) === 1
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-slate-700 text-gray-300'
                                }`}
                              >
                                {Number(shift.is_active) === 1
                                  ? 'Active'
                                  : 'Previous'}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan="5"
                            className="p-6 text-center text-gray-400"
                          >
                            No shift history found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <h3 className="font-bold text-lg mb-3 text-white">
                  Complete Duty History
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] text-sm text-white">
                    <thead>
                      <tr className="text-left text-gray-300 border-b border-white/10">
                        <th className="p-3">Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Shift</th>
                        <th className="p-3">Time</th>
                        <th className="p-3">Notes</th>
                      </tr>
                    </thead>

                    <tbody>
                      {historyData.duties.length > 0 ? (
                        historyData.duties.map((duty) => (
                          <tr
                            key={duty.id}
                            className="border-b border-white/5 text-gray-200"
                          >
                            <td className="p-3">
                              {formatDate(duty.duty_date)}
                            </td>

                            <td className="p-3">
                              <span
                                className={`inline-block px-3 py-1 rounded-full text-xs border ${dutyStatusStyle(
                                  duty.status
                                )}`}
                              >
                                {dutyStatusLabel(duty.status)}
                              </span>
                            </td>

                            <td className="p-3">
                              {duty.shift_name || 'N/A'}
                            </td>

                            <td className="p-3 text-blue-400">
                              {duty.start_time
                                ? `${formatTime(
                                    duty.start_time
                                  )} - ${formatTime(
                                    duty.end_time
                                  )}`
                                : 'N/A'}
                            </td>

                            <td className="p-3 text-gray-300">
                              {duty.notes || '—'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan="5"
                            className="p-6 text-center text-gray-400"
                          >
                            No duty history found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ============================================================
// SUMMARY CARD
// ============================================================

function SummaryCard({
  icon,
  label,
  value,
  iconClass,
}) {
  return (
    <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-5 min-w-0">
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${iconClass}`}
      >
        {icon}
      </div>

      <p className="text-2xl font-bold text-white">
        {value}
      </p>

      <p className="text-xs text-gray-500 mt-1">
        {label}
      </p>
    </div>
  );
}

// ============================================================
// MINI STAT
// ============================================================

function MiniStat({
  label,
  value,
  className = '',
}) {
  return (
    <div className="bg-slate-800/60 rounded-lg p-2 text-center border border-white/5">
      <p className={`font-bold ${className}`}>
        {value}
      </p>

      <p className="text-[9px] text-gray-500 uppercase mt-1">
        {label}
      </p>
    </div>
  );
}

// ============================================================
// USER AVATAR
// ============================================================

function UserAvatar({
  user,
  src,
  name,
  className = '',
  fallbackClassName = '',
}) {
  const resolvedName = name || user?.name || 'User';

  const resolvedImage = src
    ? getProfileImage(src)
    : getProfileImage(user);

  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [resolvedImage]);

  if (!resolvedImage || imageFailed) {
    return (
      <div
        className={`flex items-center justify-center shrink-0 font-bold uppercase select-none overflow-hidden ${fallbackClassName} ${className}`}
        title={resolvedName}
      >
        {getUserInitials(resolvedName)}
      </div>
    );
  }

  return (
    <img
      src={resolvedImage}
      alt={resolvedName}
      loading="lazy"
      onError={() => setImageFailed(true)}
      className={`shrink-0 object-cover overflow-hidden ${className}`}
    />
  );
}

// ============================================================
// USER MODAL HEADER
// ============================================================

function UserModalHeader({
  user,
  title,
  subtitle,
}) {
  return (
    <div className="flex items-center gap-4 pr-10 text-white">
      <UserAvatar
        user={user}
        className="w-14 h-14 rounded-full border-2 border-yellow-500/40 bg-slate-800"
        fallbackClassName="text-sm text-yellow-400"
      />

      <div className="min-w-0">
        <h2 className="text-xl font-bold text-white">
          {title}
        </h2>

        <p className="text-white text-sm font-medium mt-1 truncate">
          {user?.name || 'Unknown User'}
        </p>

        {subtitle && (
          <p className="text-gray-400 text-xs mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// REPORT INFO
// ============================================================

function ReportInfo({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-sm leading-6 text-gray-800 break-words">
        <strong className="font-bold text-gray-950">
          {label}:
        </strong>{' '}
        {value}
      </p>
    </div>
  );
}

// ============================================================
// REPORT STAT
// ============================================================

function ReportStat({ label, value }) {
  return (
    <div className="report-stat border border-gray-200 rounded-xl p-4 bg-gray-50 min-h-[76px]">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">
        {label}
      </p>

      <p className="font-bold text-gray-950 mt-2 break-words">
        {value}
      </p>
    </div>
  );
}

// ============================================================
// FORM LABEL
// ============================================================

function FormLabel({ label }) {
  return (
    <label className="block text-xs text-gray-300 mb-2 font-medium">
      {label}
    </label>
  );
}

// ============================================================
// MODAL OVERLAY
// ============================================================

function ModalOverlay({ children }) {
  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-sm overflow-y-auto p-3 md:p-4 text-white">
      <div className="w-full min-h-full flex items-start md:items-center justify-center py-4 md:py-6">
        {children}
      </div>
    </div>,
    document.body
  );
}

// ============================================================
// MODAL CLOSE
// ============================================================

function ModalClose({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/5 hover:bg-red-500/20 text-gray-300 hover:text-red-400 flex items-center justify-center transition"
    >
      <X size={19} />
    </button>
  );
}