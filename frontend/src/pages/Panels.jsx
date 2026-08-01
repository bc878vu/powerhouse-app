import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { socket } from '../utils/socket';

import {
  Plus,
  Search,
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  X,
  Printer,
  Zap,
  Power,
  Wrench,
  AlertTriangle,
  LayoutGrid,
  MapPin,
  Factory,
  Cable,
  Gauge,
  Cpu,
  Clock,
  ChevronDown,
  Info,
  Activity,
  Archive
} from 'lucide-react';

/* =========================================================
   STATUS CONFIGURATION
========================================================= */

const STATUS_CONFIG = {
  live: {
    label: 'Live',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    dot: 'bg-green-500',
    icon: Zap
  },

  off: {
    label: 'Off',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    dot: 'bg-red-500',
    icon: Power
  },

  maintenance: {
    label: 'Maintenance',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    dot: 'bg-yellow-500',
    icon: Wrench
  },

  affected: {
    label: 'Affected',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    dot: 'bg-orange-500',
    icon: AlertTriangle
  },

  unknown: {
    label: 'Unknown',
    color: 'text-slate-400',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    dot: 'bg-slate-500',
    icon: Info
  }
};

/* =========================================================
   PANEL DETAIL SECTIONS
========================================================= */

const FIELD_SECTIONS = [
  {
    title: 'General Information',
    icon: Factory,
    fields: [
      {
        name: 'panel_code',
        label: 'Panel Code'
      },
      {
        name: 'panel_name',
        label: 'Panel Name'
      },
      {
        name: 'panel_type',
        label: 'Panel Type'
      },
      {
        name: 'source_panel_id',
        label: 'Source Panel'
      },
      {
        name: 'area',
        label: 'Area'
      },
      {
        name: 'location',
        label: 'Location'
      }
    ]
  },

  {
    title: 'Electrical Specifications',
    icon: Zap,
    fields: [
      {
        name: 'voltage',
        label: 'Voltage'
      },
      {
        name: 'rated_current',
        label: 'Rated Current'
      },
      {
        name: 'frequency',
        label: 'Frequency'
      },
      {
        name: 'phase',
        label: 'Phase'
      },
      {
        name: 'short_circuit_rating',
        label: 'Short Circuit Rating'
      },
      {
        name: 'insulation_voltage',
        label: 'Insulation Voltage'
      },
      {
        name: 'control_voltage',
        label: 'Control Voltage'
      },
      {
        name: 'earthing_details',
        label: 'Earthing Details'
      }
    ]
  },

  {
    title: 'Incomer, Breaker & Busbar',
    icon: Gauge,
    fields: [
      {
        name: 'incomer_type',
        label: 'Incomer Type'
      },
      {
        name: 'incomer_rating',
        label: 'Incomer Rating'
      },
      {
        name: 'breaker_type',
        label: 'Breaker Type'
      },
      {
        name: 'breaker_rating',
        label: 'Breaker Rating'
      },
      {
        name: 'breaking_capacity',
        label: 'Breaking Capacity'
      },
      {
        name: 'busbar_rating',
        label: 'Busbar Rating'
      },
      {
        name: 'busbar_material',
        label: 'Busbar Material'
      }
    ]
  },

  {
    title: 'Incoming Cable',
    icon: Cable,
    fields: [
      {
        name: 'incoming_cable_size',
        label: 'Cable Size'
      },
      {
        name: 'incoming_cable_type',
        label: 'Cable Type'
      },
      {
        name: 'incoming_cable_cores',
        label: 'Cable Cores'
      },
      {
        name: 'incoming_cable_length',
        label: 'Cable Length'
      }
    ]
  },

  {
    title: 'Manufacturer & Equipment',
    icon: Cpu,
    fields: [
      {
        name: 'manufacturer',
        label: 'Manufacturer'
      },
      {
        name: 'model',
        label: 'Model'
      },
      {
        name: 'serial_number',
        label: 'Serial Number'
      },
      {
        name: 'ip_rating',
        label: 'IP Rating'
      },
      {
        name: 'installation_date',
        label: 'Installation Date'
      },
      {
        name: 'last_maintenance_date',
        label: 'Last Maintenance Date'
      },
      {
        name: 'next_maintenance_date',
        label: 'Next Maintenance Date'
      }
    ]
  },

  {
    title: 'Status & Additional Information',
    icon: Activity,
    fields: [
      {
        name: 'status_reason',
        label: 'Status Reason'
      },
      {
        name: 'description',
        label: 'Description'
      },
      {
        name: 'notes',
        label: 'Notes'
      }
    ]
  }
];

/* =========================================================
   HELPER FUNCTIONS
========================================================= */

const getList = (data, key = 'panels') => {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.[key])) {
    return data[key];
  }

  return [];
};

const formatDate = (value) => {
  if (!value) {
    return 'N/A';
  }

  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return 'N/A';
  }
};

const formatDateTime = (value) => {
  if (!value) {
    return 'N/A';
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return 'N/A';
  }
};

const formatDuration = (seconds) => {
  const total = Math.max(0, Number(seconds) || 0);

  const days = Math.floor(total / 86400);

  const hours = Math.floor(
    (total % 86400) / 3600
  );

  const minutes = Math.floor(
    (total % 3600) / 60
  );

  if (days) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes) {
    return `${minutes}m`;
  }

  return `${total}s`;
};

const displayValue = (value) => {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return 'N/A';
  }

  return String(value);
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function Panels() {

  const navigate = useNavigate();

  /* =======================================================
     STATES
  ======================================================= */

  const [panels, setPanels] = useState([]);

  const [networkPanels, setNetworkPanels] = useState([]);

  const [loading, setLoading] = useState(true);

  const [deletingId, setDeletingId] = useState(null);

  const [statusUpdatingId, setStatusUpdatingId] = useState(null);

  const [search, setSearch] = useState('');

  const [statusFilter, setStatusFilter] = useState('all');

  const [typeFilter, setTypeFilter] = useState('all');

  const [viewOpen, setViewOpen] = useState(false);

  const [statusModal, setStatusModal] = useState(null);

  const [statusReason, setStatusReason] = useState('');

  const [selectedPanel, setSelectedPanel] = useState(null);

  const [selectedStats, setSelectedStats] = useState(null);

  const [viewLoading, setViewLoading] = useState(false);

  const [message, setMessage] = useState(null);

  /* =======================================================
     MESSAGE
  ======================================================= */

  const showMessage = useCallback((type, text) => {

    setMessage({
      type,
      text
    });

    setTimeout(() => {
      setMessage(null);
    }, 3500);

  }, []);

  /* =======================================================
     FETCH PANELS
  ======================================================= */

  const fetchPanels = useCallback(
    async (showLoader = true) => {

      if (showLoader) {
        setLoading(true);
      }

      try {

        const results = await Promise.allSettled([
          API.get('/panels'),
          API.get('/panels/network/status')
        ]);

        if (results[0].status === 'fulfilled') {

          const activePanels = getList(
            results[0].value.data
          ).filter((panel) => {

            return (
              panel.is_deleted !== 1 &&
              panel.deleted !== 1 &&
              panel.is_archived !== 1 &&
              panel.archived !== 1 &&
              panel.deleted_at == null
            );

          });

          setPanels(activePanels);
        }

        if (results[1].status === 'fulfilled') {

          const activeNetworkPanels = getList(
            results[1].value.data
          ).filter((panel) => {

            return (
              panel.is_deleted !== 1 &&
              panel.deleted !== 1 &&
              panel.is_archived !== 1 &&
              panel.archived !== 1 &&
              panel.deleted_at == null
            );

          });

          setNetworkPanels(activeNetworkPanels);
        }

        if (results[0].status === 'rejected') {
          throw results[0].reason;
        }

      } catch (err) {

        console.error(
          'Panels fetch error:',
          err
        );

        showMessage(
          'error',
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          'Failed to load panels.'
        );

      } finally {

        setLoading(false);

      }

    },
    [showMessage]
  );

  /* =======================================================
     INITIAL FETCH
  ======================================================= */

  useEffect(() => {

    fetchPanels();

  }, [fetchPanels]);

  /* =======================================================
     SOCKET REAL-TIME UPDATES
  ======================================================= */

  useEffect(() => {

    const refresh = () => {
      fetchPanels(false);
    };

    socket.on(
      'panelCreated',
      refresh
    );

    socket.on(
      'panelUpdated',
      refresh
    );

    socket.on(
      'panelDeleted',
      refresh
    );

    socket.on(
      'panelArchived',
      refresh
    );

    socket.on(
      'panelRestored',
      refresh
    );

    socket.on(
      'panelStatusUpdated',
      refresh
    );

    socket.on(
      'panelNetworkUpdated',
      refresh
    );

    return () => {

      socket.off(
        'panelCreated',
        refresh
      );

      socket.off(
        'panelUpdated',
        refresh
      );

      socket.off(
        'panelDeleted',
        refresh
      );

      socket.off(
        'panelArchived',
        refresh
      );

      socket.off(
        'panelRestored',
        refresh
      );

      socket.off(
        'panelStatusUpdated',
        refresh
      );

      socket.off(
        'panelNetworkUpdated',
        refresh
      );

    };

  }, [fetchPanels]);

  /* =======================================================
     EFFECTIVE PANEL STATUS
  ======================================================= */

  const getEffectiveStatus = useCallback(
    (panel) => {

      const networkPanel = networkPanels.find(
        (item) =>
          Number(item.id) === Number(panel.id)
      );

      return String(
        networkPanel?.effective_status ||
        panel?.effective_status ||
        panel?.status ||
        'unknown'
      ).toLowerCase();

    },
    [networkPanels]
  );

  /* =======================================================
     PANEL COUNTS
  ======================================================= */

  const counts = useMemo(() => {

    const result = {
      total: panels.length,
      live: 0,
      off: 0,
      maintenance: 0,
      affected: 0
    };

    panels.forEach((panel) => {

      const status =
        getEffectiveStatus(panel);

      if (
        Object.prototype.hasOwnProperty.call(
          result,
          status
        )
      ) {
        result[status] += 1;
      }

    });

    return result;

  }, [panels, getEffectiveStatus]);

  /* =======================================================
     PANEL TYPES
  ======================================================= */

  const panelTypes = useMemo(() => {

    return [
      ...new Set(
        panels
          .map((panel) => panel.panel_type)
          .filter(Boolean)
      )
    ].sort();

  }, [panels]);

  /* =======================================================
     FILTERED PANELS
  ======================================================= */

  const filteredPanels = useMemo(() => {

    const term =
      search.trim().toLowerCase();

    return panels.filter((panel) => {

      const status =
        getEffectiveStatus(panel);

      const matchesSearch =
        !term ||
        [
          panel.panel_code,
          panel.panel_name,
          panel.panel_type,
          panel.area,
          panel.location,
          panel.manufacturer,
          panel.model,
          panel.serial_number
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term);

      const matchesStatus =
        statusFilter === 'all' ||
        status === statusFilter;

      const matchesType =
        typeFilter === 'all' ||
        panel.panel_type === typeFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesType
      );

    });

  }, [
    panels,
    search,
    statusFilter,
    typeFilter,
    getEffectiveStatus
  ]);

  /* =======================================================
     ADD PANEL REDIRECT
  ======================================================= */

  const openAdd = () => {
    navigate('/add-panel');
  };

  /* =======================================================
     EDIT PANEL REDIRECT
  ======================================================= */

  const openEdit = (panel) => {
    navigate(`/add-panel/${panel.id}`);
  };

  /* =======================================================
     STATUS MODAL
  ======================================================= */

  const openStatusModal = (
    panel,
    newStatus
  ) => {

    const currentStatus = String(
      panel?.status || 'live'
    ).toLowerCase();

    if (
      !newStatus ||
      currentStatus === newStatus
    ) {
      return;
    }

    setStatusReason('');

    setStatusModal({
      panel,
      newStatus
    });

  };

  /* =======================================================
     CONFIRM STATUS CHANGE
  ======================================================= */

  const confirmStatusChange = async () => {

    if (
      !statusModal?.panel?.id ||
      !statusModal?.newStatus
    ) {
      return;
    }

    const {
      panel,
      newStatus
    } = statusModal;

    setStatusUpdatingId(panel.id);

    try {

      const response = await API.put(
        `/panels/${panel.id}/status`,
        {
          status: newStatus,

          reason:
            statusReason.trim() ||
            `Panel changed to ${newStatus}`
        }
      );

      const updatedPanel =
        response.data?.panel;

      setPanels((previous) =>
        previous.map((item) =>
          Number(item.id) === Number(panel.id)
            ? {
                ...item,
                ...(updatedPanel || {}),
                status: newStatus,
                status_reason:
                  statusReason.trim() ||
                  `Panel changed to ${newStatus}`
              }
            : item
        )
      );

      setStatusModal(null);

      setStatusReason('');

      showMessage(
        'success',
        `${panel.panel_name} status changed to ${
          STATUS_CONFIG[newStatus]?.label ||
          newStatus
        }.`
      );

      await fetchPanels(false);

    } catch (err) {

      console.error(
        'Panel status update error:',
        err
      );

      showMessage(
        'error',
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Could not update panel status.'
      );

    } finally {

      setStatusUpdatingId(null);

    }

  };

  /* =======================================================
     OPEN PANEL VIEW
  ======================================================= */

  const openView = async (panel) => {

    setViewOpen(true);

    setSelectedPanel(panel);

    setSelectedStats(null);

    setViewLoading(true);

    try {

      const results =
        await Promise.allSettled([
          API.get(`/panels/${panel.id}`),

          API.get(
            `/panels/${panel.id}/stats`
          )
        ]);

      if (
        results[0].status === 'fulfilled'
      ) {

        const data =
          results[0].value.data;

        setSelectedPanel(
          data?.panel || data
        );

      }

      if (
        results[1].status === 'fulfilled'
      ) {

        setSelectedStats(
          results[1].value.data
        );

      }

    } catch (err) {

      console.error(
        'Panel view error:',
        err
      );

    } finally {

      setViewLoading(false);

    }

  };

  /* =======================================================
     ARCHIVE / DELETE PANEL
  ======================================================= */

  const handleDelete = async (panel) => {

    const confirmed = window.confirm(
      `Move "${panel.panel_name}" (${panel.panel_code}) to Panel History?\n\n` +
      `The panel will be removed from the active panel list and interactive map, but its complete saved data will remain available in Panel History.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(panel.id);

    try {

      await API.delete(
        `/panels/${panel.id}`
      );

      /*
       * Immediately remove from active frontend list.
       * Backend must archive/soft-delete the panel.
       */

      setPanels((previous) =>
        previous.filter(
          (item) =>
            Number(item.id) !==
            Number(panel.id)
        )
      );

      setNetworkPanels((previous) =>
        previous.filter(
          (item) =>
            Number(item.id) !==
            Number(panel.id)
        )
      );

      if (
        selectedPanel &&
        Number(selectedPanel.id) ===
          Number(panel.id)
      ) {
        setViewOpen(false);
        setSelectedPanel(null);
        setSelectedStats(null);
      }

      showMessage(
        'success',
        `"${panel.panel_name}" moved to Panel History successfully.`
      );

      await fetchPanels(false);

    } catch (err) {

      console.error(
        'Panel archive error:',
        err
      );

      showMessage(
        'error',
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Could not move panel to history.'
      );

    } finally {

      setDeletingId(null);

    }

  };

  /* =======================================================
     PRINT
  ======================================================= */

  const handlePrint = () => {
    window.print();
  };

  /* =======================================================
     SELECTED STATUS
  ======================================================= */

  const selectedStatus =
    selectedPanel
      ? getEffectiveStatus(selectedPanel)
      : 'unknown';

  const selectedConfig =
    STATUS_CONFIG[selectedStatus] ||
    STATUS_CONFIG.unknown;

  /* =======================================================
     JSX
  ======================================================= */

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ===================================================
          SUCCESS / ERROR MESSAGE
      =================================================== */}

      {message && (
        <div
          className={`fixed top-5 right-5 z-[1400] max-w-sm px-5 py-4 rounded-2xl border shadow-2xl ${
            message.type === 'success'
              ? 'bg-green-500 text-black border-green-400'
              : 'bg-red-500 text-white border-red-400'
          }`}
        >
          <p className="font-black text-sm">
            {message.text}
          </p>
        </div>
      )}

      {/* ===================================================
          PAGE HEADER
      =================================================== */}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">

        <div className="flex items-center gap-4">

          <div className="w-12 h-12 bg-yellow-500 rounded-2xl flex items-center justify-center text-black shadow-lg shadow-yellow-500/20">
            <LayoutGrid size={24} />
          </div>

          <div>

            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Panel Management
            </h1>

            <p className="text-slate-500 text-sm mt-1">
              View, monitor, update and manage all electrical panels
            </p>

          </div>

        </div>

        <div className="flex flex-wrap gap-2">

          <button
            onClick={() => fetchPanels(true)}
            disabled={loading}
            className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw
              size={18}
              className={
                loading
                  ? 'animate-spin'
                  : ''
              }
            />
          </button>

          <button
            onClick={() =>
              navigate('/panel-history')
            }
            className="flex items-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
          >
            <Archive size={18} />
            Panel History
          </button>

          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-5 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-yellow-500/10 transition-all"
          >
            <Plus size={18} />
            Add New Panel
          </button>

        </div>

      </div>

      {/* ===================================================
          STATISTICS
      =================================================== */}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">

        {[
          [
            'Total Panels',
            counts.total,
            'all',
            LayoutGrid
          ],
          [
            'Live',
            counts.live,
            'live',
            Zap
          ],
          [
            'Off',
            counts.off,
            'off',
            Power
          ],
          [
            'Maintenance',
            counts.maintenance,
            'maintenance',
            Wrench
          ],
          [
            'Affected',
            counts.affected,
            'affected',
            AlertTriangle
          ]
        ].map(
          ([
            label,
            value,
            status,
            Icon
          ]) => {

            const config =
              status === 'all'
                ? STATUS_CONFIG.unknown
                : STATUS_CONFIG[status];

            const active =
              statusFilter === status;

            return (
              <button
                key={label}
                onClick={() =>
                  setStatusFilter(status)
                }
                className={`text-left p-4 rounded-2xl border transition-all ${
                  active
                    ? `${config.bg} ${config.border}`
                    : 'bg-[#020617] border-white/5 hover:border-white/10'
                }`}
              >

                <div className="flex items-center justify-between gap-3">

                  <div>

                    <p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">
                      {label}
                    </p>

                    <p
                      className={`text-3xl font-black mt-2 ${config.color}`}
                    >
                      {value}
                    </p>

                  </div>

                  <div
                    className={`w-10 h-10 rounded-xl ${config.bg} ${config.color} flex items-center justify-center`}
                  >
                    <Icon size={19} />
                  </div>

                </div>

              </button>
            );

          }
        )}

      </div>

      {/* ===================================================
          SEARCH & FILTERS
      =================================================== */}

      <div className="bg-[#020617] border border-white/5 rounded-2xl p-4 flex flex-col lg:flex-row gap-3">

        <div className="relative flex-1">

          <Search
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
          />

          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search by code, name, type, area, location, manufacturer..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white outline-none focus:border-yellow-500/50"
          />

        </div>

        <div className="relative">

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value
              )
            }
            className="appearance-none w-full lg:w-48 bg-white/5 border border-white/10 rounded-xl px-4 pr-10 py-3.5 text-xs text-white outline-none"
          >
            <option
              className="bg-slate-900"
              value="all"
            >
              All Statuses
            </option>

            <option
              className="bg-slate-900"
              value="live"
            >
              Live
            </option>

            <option
              className="bg-slate-900"
              value="off"
            >
              Off
            </option>

            <option
              className="bg-slate-900"
              value="maintenance"
            >
              Maintenance
            </option>

            <option
              className="bg-slate-900"
              value="affected"
            >
              Affected
            </option>

          </select>

          <ChevronDown
            size={15}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
          />

        </div>

        <div className="relative">

          <select
            value={typeFilter}
            onChange={(event) =>
              setTypeFilter(
                event.target.value
              )
            }
            className="appearance-none w-full lg:w-48 bg-white/5 border border-white/10 rounded-xl px-4 pr-10 py-3.5 text-xs text-white outline-none"
          >

            <option
              className="bg-slate-900"
              value="all"
            >
              All Panel Types
            </option>

            {panelTypes.map((type) => (
              <option
                className="bg-slate-900"
                key={type}
                value={type}
              >
                {type}
              </option>
            ))}

          </select>

          <ChevronDown
            size={15}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
          />

        </div>

      </div>

      {/* ===================================================
          PANEL TABLE
      =================================================== */}

      <div className="bg-[#020617] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">

        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">

          <div>

            <h2 className="text-white font-black text-sm uppercase tracking-wider">
              All Electrical Panels
            </h2>

            <p className="text-slate-500 text-[10px] mt-1">
              Showing {filteredPanels.length} of {panels.length} active panels
            </p>

          </div>

        </div>

        {loading ? (

          <div className="min-h-[350px] flex flex-col items-center justify-center gap-4">

            <RefreshCw
              size={30}
              className="text-yellow-500 animate-spin"
            />

            <p className="text-slate-500 text-xs uppercase tracking-widest font-black">
              Loading Panels
            </p>

          </div>

        ) : filteredPanels.length === 0 ? (

          <div className="min-h-[350px] flex flex-col items-center justify-center gap-4">

            <LayoutGrid
              size={45}
              className="text-slate-800"
            />

            <p className="text-slate-500 text-xs uppercase tracking-widest font-black">
              No active panels found
            </p>

          </div>

        ) : (

          <div className="overflow-x-auto">

            <table className="w-full min-w-[1150px]">

              <thead>

                <tr className="border-b border-white/5">

                  {[
                    'Panel',
                    'Type',
                    'Source Panel',
                    'Area / Location',
                    'Status / Mode',
                    'Electrical',
                    'Actions'
                  ].map((heading) => (

                    <th
                      key={heading}
                      className="text-left px-5 py-4 text-[9px] uppercase tracking-widest text-slate-500 font-black"
                    >
                      {heading}
                    </th>

                  ))}

                </tr>

              </thead>

              <tbody>

                {filteredPanels.map(
                  (panel) => {

                    const effectiveStatus =
                      getEffectiveStatus(panel);

                    const actualStatus =
                      String(
                        panel.status || 'live'
                      ).toLowerCase();

                    const config =
                      STATUS_CONFIG[
                        effectiveStatus
                      ] ||
                      STATUS_CONFIG.unknown;

                    const StatusIcon =
                      config.icon;

                    return (

                      <tr
                        key={panel.id}
                        className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors"
                      >

                        {/* PANEL */}

                        <td className="px-5 py-4">

                          <div className="flex items-center gap-3">

                            <div
                              className={`relative w-10 h-10 rounded-xl ${config.bg} ${config.color} flex items-center justify-center`}
                            >

                              <Zap size={18} />

                              <span
                                className={`absolute -right-1 -top-1 w-3 h-3 rounded-full ${config.dot} border-2 border-[#020617]`}
                              />

                            </div>

                            <div>

                              <p className="text-white text-sm font-black">
                                {panel.panel_name ||
                                  'Unnamed Panel'}
                              </p>

                              <p className="text-yellow-500 text-[10px] font-black mt-1">
                                {panel.panel_code ||
                                  'N/A'}
                              </p>

                            </div>

                          </div>

                        </td>

                        {/* TYPE */}

                        <td className="px-5 py-4 text-xs text-slate-300 font-bold">
                          {panel.panel_type ||
                            'N/A'}
                        </td>

                        {/* SOURCE */}

                        <td className="px-5 py-4">

                          <p className="text-xs text-white font-bold">
                            {panel.source_panel_code ||
                              'Main / No Source'}
                          </p>

                          <p className="text-[10px] text-slate-500 mt-1">
                            {panel.source_panel_name ||
                              ''}
                          </p>

                        </td>

                        {/* LOCATION */}

                        <td className="px-5 py-4">

                          <p className="text-xs text-white font-bold">
                            {panel.area || 'N/A'}
                          </p>

                          <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">

                            <MapPin size={10} />

                            {panel.location ||
                              'No location'}

                          </p>

                        </td>

                        {/* STATUS */}

                        <td className="px-5 py-4">

                          <div className="flex flex-col gap-2 min-w-[175px]">

                            <span
                              className={`inline-flex w-fit items-center gap-2 px-3 py-2 rounded-full text-[9px] uppercase tracking-wider font-black ${config.bg} ${config.color} border ${config.border}`}
                            >

                              <StatusIcon
                                size={12}
                              />

                              {config.label}

                            </span>

                            <div className="relative">

                              <select
                                value={
                                  actualStatus
                                }
                                onChange={(
                                  event
                                ) =>
                                  openStatusModal(
                                    panel,
                                    event.target.value
                                  )
                                }
                                disabled={
                                  statusUpdatingId ===
                                  panel.id
                                }
                                className={`appearance-none w-full rounded-xl px-3 pr-9 py-2.5 text-[10px] font-black uppercase tracking-wider outline-none border transition-all cursor-pointer disabled:opacity-50 ${
                                  actualStatus ===
                                  'live'
                                    ? 'bg-green-500/10 text-green-400 border-green-500/30'
                                    : actualStatus ===
                                      'off'
                                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                    : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                                }`}
                              >

                                <option
                                  className="bg-slate-900 text-green-400"
                                  value="live"
                                >
                                  Live
                                </option>

                                <option
                                  className="bg-slate-900 text-red-400"
                                  value="off"
                                >
                                  Off
                                </option>

                                <option
                                  className="bg-slate-900 text-yellow-400"
                                  value="maintenance"
                                >
                                  Maintenance
                                </option>

                              </select>

                              {statusUpdatingId ===
                              panel.id ? (

                                <RefreshCw
                                  size={14}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin pointer-events-none"
                                />

                              ) : (

                                <ChevronDown
                                  size={14}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                                />

                              )}

                            </div>

                            {effectiveStatus ===
                              'affected' && (

                              <p className="text-[9px] text-orange-400 font-bold leading-relaxed flex items-center gap-1">

                                <AlertTriangle
                                  size={11}
                                />

                                Upstream supply is not live

                              </p>

                            )}

                          </div>

                        </td>

                        {/* ELECTRICAL */}

                        <td className="px-5 py-4">

                          <p className="text-xs text-white font-bold">
                            {panel.voltage ||
                              'N/A'}
                          </p>

                          <p className="text-[10px] text-slate-500 mt-1">
                            {panel.rated_current ||
                              'N/A'}
                          </p>

                        </td>

                        {/* ACTIONS */}

                        <td className="px-5 py-4">

                          <div className="flex items-center gap-2">

                            <button
                              onClick={() =>
                                openView(panel)
                              }
                              className="w-9 h-9 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded-xl flex items-center justify-center transition-all"
                              title="View"
                            >
                              <Eye size={16} />
                            </button>

                            <button
                              onClick={() =>
                                openEdit(panel)
                              }
                              className="w-9 h-9 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500 hover:text-black rounded-xl flex items-center justify-center transition-all"
                              title="Edit"
                            >
                              <Pencil size={16} />
                            </button>

                            <button
                              onClick={() =>
                                handleDelete(panel)
                              }
                              disabled={
                                deletingId ===
                                panel.id
                              }
                              className="w-9 h-9 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-xl flex items-center justify-center transition-all disabled:opacity-40"
                              title="Move to Panel History"
                            >

                              {deletingId ===
                              panel.id ? (

                                <RefreshCw
                                  size={16}
                                  className="animate-spin"
                                />

                              ) : (

                                <Trash2
                                  size={16}
                                />

                              )}

                            </button>

                          </div>

                        </td>

                      </tr>

                    );

                  }
                )}

              </tbody>

            </table>

          </div>

        )}

      </div>

      {/* ===================================================
          STATUS CHANGE MODAL
      =================================================== */}

      {statusModal && (

        <div className="fixed inset-0 z-[1300] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">

          <div className="w-full max-w-lg bg-[#07101f] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl">

            <div className="p-6 border-b border-white/5 flex items-start justify-between gap-4">

              <div>

                <p className="text-[9px] uppercase tracking-[0.25em] text-yellow-500 font-black">
                  Change Panel Mode
                </p>

                <h3 className="text-xl text-white font-black mt-2">
                  {statusModal.panel.panel_name}
                </h3>

                <p className="text-slate-500 text-xs mt-1">
                  {statusModal.panel.panel_code}
                </p>

              </div>

              <button
                onClick={() => {
                  setStatusModal(null);
                  setStatusReason('');
                }}
                className="w-10 h-10 bg-white/5 hover:bg-red-500 rounded-xl flex items-center justify-center transition-all"
              >
                <X size={18} />
              </button>

            </div>

            <div className="p-6">

              <div className="grid grid-cols-2 gap-3 mb-5">

                <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl">

                  <p className="text-[9px] text-slate-500 uppercase font-black">
                    Current Mode
                  </p>

                  <p className="text-white font-black mt-2 uppercase">
                    {statusModal.panel.status ||
                      'Live'}
                  </p>

                </div>

                <div
                  className={`p-4 rounded-2xl border ${
                    STATUS_CONFIG[
                      statusModal.newStatus
                    ]?.bg
                  } ${
                    STATUS_CONFIG[
                      statusModal.newStatus
                    ]?.border
                  }`}
                >

                  <p className="text-[9px] text-slate-500 uppercase font-black">
                    New Mode
                  </p>

                  <p
                    className={`font-black mt-2 uppercase ${
                      STATUS_CONFIG[
                        statusModal.newStatus
                      ]?.color
                    }`}
                  >
                    {
                      STATUS_CONFIG[
                        statusModal.newStatus
                      ]?.label
                    }
                  </p>

                </div>

              </div>

              <label className="block text-[9px] text-slate-500 uppercase tracking-widest font-black mb-2">
                Reason for status change
              </label>

              <textarea
                value={statusReason}
                onChange={(event) =>
                  setStatusReason(
                    event.target.value
                  )
                }
                rows={4}
                placeholder={
                  statusModal.newStatus ===
                  'off'
                    ? 'e.g. Main supply shutdown, fault, breaker trip...'
                    : statusModal.newStatus ===
                      'maintenance'
                    ? 'e.g. Preventive maintenance, inspection, repair...'
                    : 'e.g. Supply restored, maintenance completed...'
                }
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-yellow-500/50 resize-y"
              />

              <div className="flex justify-end gap-3 mt-6">

                <button
                  onClick={() => {
                    setStatusModal(null);
                    setStatusReason('');
                  }}
                  className="px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                >
                  Cancel
                </button>

                <button
                  onClick={
                    confirmStatusChange
                  }
                  disabled={
                    statusUpdatingId ===
                    statusModal.panel.id
                  }
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 ${
                    statusModal.newStatus ===
                    'live'
                      ? 'bg-green-500 hover:bg-green-400 text-black'
                      : statusModal.newStatus ===
                        'off'
                      ? 'bg-red-500 hover:bg-red-400 text-white'
                      : 'bg-yellow-500 hover:bg-yellow-400 text-black'
                  }`}
                >

                  {statusUpdatingId ===
                  statusModal.panel.id ? (

                    <RefreshCw
                      size={17}
                      className="animate-spin"
                    />

                  ) : statusModal.newStatus ===
                    'live' ? (

                    <Zap size={17} />

                  ) : statusModal.newStatus ===
                    'off' ? (

                    <Power size={17} />

                  ) : (

                    <Wrench size={17} />

                  )}

                  Confirm Change

                </button>

              </div>

            </div>

          </div>

        </div>

      )}

      {/* ===================================================
          VIEW PANEL POPUP
      =================================================== */}

      {viewOpen && selectedPanel && (

        <div className="fixed inset-0 z-[1000] bg-black/75 backdrop-blur-md flex items-center justify-center p-3 md:p-6 print:static print:bg-white print:p-0">

          <div className="w-full max-w-6xl max-h-[94vh] bg-[#07101f] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl print:max-w-none print:max-h-none print:bg-white print:text-black print:border-0 print:rounded-none print:shadow-none">

            {/* HEADER */}

            <div className="flex items-start justify-between gap-4 p-5 md:p-7 border-b border-white/5 print:border-black">

              <div>

                <div className="flex flex-wrap items-center gap-3">

                  <h2 className="text-2xl md:text-3xl text-white font-black print:text-black">
                    {selectedPanel.panel_name}
                  </h2>

                  <span
                    className={`px-3 py-1.5 rounded-full text-[9px] uppercase font-black ${selectedConfig.bg} ${selectedConfig.color} border ${selectedConfig.border}`}
                  >
                    {selectedConfig.label}
                  </span>

                </div>

                <p className="text-yellow-500 font-black text-xs uppercase tracking-widest mt-2 print:text-black">
                  {selectedPanel.panel_code}
                </p>

              </div>

              <div className="flex gap-2 print:hidden">

                <button
                  onClick={handlePrint}
                  className="w-10 h-10 bg-yellow-500 text-black hover:bg-yellow-400 rounded-xl flex items-center justify-center transition-all"
                  title="Print Full Report"
                >
                  <Printer size={18} />
                </button>

                <button
                  onClick={() =>
                    setViewOpen(false)
                  }
                  className="w-10 h-10 bg-white/5 hover:bg-red-500 rounded-xl flex items-center justify-center transition-all"
                >
                  <X size={19} />
                </button>

              </div>

            </div>

            {/* CONTENT */}

            <div className="max-h-[calc(94vh-105px)] overflow-y-auto p-5 md:p-7 print:max-h-none print:overflow-visible">

              {viewLoading ? (

                <div className="min-h-[350px] flex items-center justify-center">

                  <RefreshCw
                    size={30}
                    className="text-yellow-500 animate-spin"
                  />

                </div>

              ) : (

                <div
                  className="space-y-7"
                  id="panel-print-report"
                >

                  {/* PRINT HEADER */}

                  <div className="hidden print:block text-center mb-8">

                    <h1 className="text-2xl font-bold">
                      POWERHOUSE ENTERPRISE
                    </h1>

                    <p className="text-sm mt-1">
                      Electrical Panel Technical Specification Report
                    </p>

                  </div>

                  {/* STAT BOXES */}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

                    <StatBox
                      label="Status"
                      value={
                        selectedConfig.label
                      }
                    />

                    <StatBox
                      label="Today's Outages"
                      value={
                        selectedStats?.today
                          ?.outage_count ?? 0
                      }
                    />

                    <StatBox
                      label="Week Downtime"
                      value={formatDuration(
                        selectedStats?.week
                          ?.total_downtime_seconds
                      )}
                    />

                    <StatBox
                      label="Month Outages"
                      value={
                        selectedStats?.month
                          ?.outage_count ?? 0
                      }
                    />

                  </div>

                  {/* TECHNICAL SECTIONS */}

                  {FIELD_SECTIONS.map(
                    (section) => {

                      const SectionIcon =
                        section.icon;

                      return (

                        <section
                          key={section.title}
                          className="print:break-inside-avoid"
                        >

                          <h3 className="flex items-center gap-2 text-sm text-white uppercase tracking-wider font-black mb-4 print:text-black print:border-b print:border-black print:pb-2">

                            <SectionIcon
                              size={17}
                              className="text-yellow-500 print:text-black"
                            />

                            {section.title}

                          </h3>

                          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 print:grid-cols-2">

                            {section.fields.map(
                              (field) => {

                                let value =
                                  selectedPanel[
                                    field.name
                                  ];

                                if (
                                  field.name.includes(
                                    '_date'
                                  )
                                ) {
                                  value =
                                    formatDate(value);
                                }

                                if (
                                  field.name ===
                                  'source_panel_id'
                                ) {

                                  value =
                                    selectedPanel
                                      .source_panel_code
                                      ? `${selectedPanel.source_panel_code} — ${
                                          selectedPanel.source_panel_name ||
                                          ''
                                        }`
                                      : 'Main / No Source Panel';

                                }

                                return (

                                  <DetailBox
                                    key={
                                      field.name
                                    }
                                    label={
                                      field.label
                                    }
                                    value={displayValue(
                                      value
                                    )}
                                  />

                                );

                              }
                            )}

                          </div>

                        </section>

                      );

                    }
                  )}

                  {/* DOWNTIME STATS */}

                  <section className="print:break-inside-avoid">

                    <h3 className="flex items-center gap-2 text-sm text-white uppercase tracking-wider font-black mb-4 print:text-black print:border-b print:border-black print:pb-2">

                      <Clock
                        size={17}
                        className="text-yellow-500 print:text-black"
                      />

                      Downtime & Outage Statistics

                    </h3>

                    <div className="grid md:grid-cols-3 gap-3 print:grid-cols-3">

                      {[
                        [
                          'Today',
                          selectedStats?.today
                        ],
                        [
                          'This Week',
                          selectedStats?.week
                        ],
                        [
                          'This Month',
                          selectedStats?.month
                        ]
                      ].map(
                        ([label, stats]) => (

                          <div
                            key={label}
                            className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl print:bg-white print:border-black print:rounded-none"
                          >

                            <p className="text-yellow-500 text-[10px] uppercase font-black print:text-black">
                              {label}
                            </p>

                            <p className="text-white text-sm mt-3 print:text-black">

                              Outages:{' '}

                              <strong>
                                {stats?.outage_count ??
                                  0}
                              </strong>

                            </p>

                            <p className="text-white text-sm mt-2 print:text-black">

                              Downtime:{' '}

                              <strong>
                                {formatDuration(
                                  stats?.total_downtime_seconds
                                )}
                              </strong>

                            </p>

                          </div>

                        )
                      )}

                    </div>

                  </section>

                  {/* PRINT FOOTER */}

                  <div className="hidden print:block mt-10 pt-4 border-t border-black text-xs">

                    <div className="flex justify-between">

                      <span>
                        Generated:{' '}
                        {formatDateTime(
                          new Date()
                        )}
                      </span>

                      <span>
                        PowerHouse Enterprise v1.2
                      </span>

                    </div>

                  </div>

                </div>

              )}

            </div>

          </div>

        </div>

      )}

      {/* ===================================================
          PRINT CSS
      =================================================== */}

      <style>{`
        @media print {

          @page {
            size: A4;
            margin: 12mm;
          }

          body * {
            visibility: hidden !important;
          }

          #panel-print-report,
          #panel-print-report * {
            visibility: visible !important;
          }

          #panel-print-report {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            color: black !important;
          }

          #panel-print-report section {
            page-break-inside: avoid;
          }

        }
      `}</style>

    </div>
  );
}

/* =========================================================
   STAT BOX
========================================================= */

function StatBox({
  label,
  value
}) {

  return (

    <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl print:bg-white print:border-black print:rounded-none">

      <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black print:text-black">
        {label}
      </p>

      <p className="text-lg text-white font-black mt-2 print:text-black">
        {value}
      </p>

    </div>

  );

}

/* =========================================================
   DETAIL BOX
========================================================= */

function DetailBox({
  label,
  value
}) {

  return (

    <div className="p-3 bg-white/[0.03] border border-white/5 rounded-2xl print:bg-white print:border-black print:rounded-none">

      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-black print:text-black">
        {label}
      </p>

      <p className="text-sm text-white font-bold mt-1 break-words print:text-black">
        {value}
      </p>

    </div>

  );

}