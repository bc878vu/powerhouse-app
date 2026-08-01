import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Archive,
  Search,
  RefreshCw,
  Eye,
  Printer,
  RotateCcw,
  Trash2,
  X,
  AlertTriangle,
  CircuitBoard,
  MapPin,
  Zap,
  Activity,
  Calendar,
  Clock,
  Database,
  ShieldAlert,
  CheckCircle2,
  Info,
  Server,
  Cable,
  Factory,
  Hash,
  Cpu,
  Gauge,
  Wrench,
  Layers3,
  FileText
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import API from '../api';

export default function PanelHistory() {
  const navigate = useNavigate();

  const [panels, setPanels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const [selectedPanel, setSelectedPanel] = useState(null);
  const [panelDetails, setPanelDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [restoringId, setRestoringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [confirmModal, setConfirmModal] = useState(null);

  const [message, setMessage] = useState({
    type: '',
    text: ''
  });

  const showMessage = (type, text) => {
    setMessage({ type, text });

    setTimeout(() => {
      setMessage({
        type: '',
        text: ''
      });
    }, 4000);
  };

  const getErrorMessage = (error, fallback) => {
    return (
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      fallback
    );
  };

  const fetchDeletedPanels = async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await API.get('/panels/history/deleted');

      const data = response?.data;

      setPanels(
        Array.isArray(data?.panels)
          ? data.panels
          : []
      );
    } catch (error) {
      console.error('FETCH DELETED PANELS ERROR:', error);

      setPanels([]);

      showMessage(
        'error',
        getErrorMessage(
          error,
          'Failed to load deleted panel history.'
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDeletedPanels();
  }, []);

  const filteredPanels = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) return panels;

    return panels.filter((panel) => {
      const searchableText = [
        panel.id,
        panel.panel_code,
        panel.panel_name,
        panel.panel_type,
        panel.area,
        panel.location,
        panel.status,
        panel.manufacturer,
        panel.model,
        panel.serial_number,
        panel.deleted_by,
        panel.deletion_reason
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(value);
    });
  }, [panels, search]);

  const openPanelDetails = async (panel) => {
    try {
      setSelectedPanel(panel);
      setPanelDetails(null);
      setDetailsLoading(true);

      const response = await API.get(
        `/panels/history/deleted/${panel.id}`
      );

      setPanelDetails(response?.data || null);
    } catch (error) {
      console.error('FETCH PANEL DETAILS ERROR:', error);

      showMessage(
        'error',
        getErrorMessage(
          error,
          'Failed to load complete panel details.'
        )
      );

      setSelectedPanel(null);
      setPanelDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    setSelectedPanel(null);
    setPanelDetails(null);
    setDetailsLoading(false);
  };

  const requestRestore = (panel) => {
    setConfirmModal({
      type: 'restore',
      panel,
      title: 'Restore Panel?',
      message:
        'This panel will return to the active panel list and interactive map. Its existing database record, specifications and history will be preserved.'
    });
  };

  const requestPermanentDelete = (panel) => {
    setConfirmModal({
      type: 'permanent-delete',
      panel,
      title: 'Permanently Delete Panel?',
      message:
        'This action is permanent and cannot be undone. The panel and its related database information may be permanently removed.'
    });
  };

  const handleRestore = async (panel) => {
    try {
      setRestoringId(panel.id);
      setConfirmModal(null);

      const response = await API.put(
        `/panels/history/deleted/${panel.id}/restore`
      );

      setPanels((previous) =>
        previous.filter(
          (item) => Number(item.id) !== Number(panel.id)
        )
      );

      if (
        selectedPanel &&
        Number(selectedPanel.id) === Number(panel.id)
      ) {
        closeDetails();
      }

      showMessage(
        'success',
        response?.data?.message ||
          `${panel.panel_name || 'Panel'} restored successfully.`
      );
    } catch (error) {
      console.error('RESTORE PANEL ERROR:', error);

      showMessage(
        'error',
        getErrorMessage(
          error,
          'Failed to restore panel.'
        )
      );
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async (panel) => {
    try {
      setDeletingId(panel.id);
      setConfirmModal(null);

      const response = await API.delete(
        `/panels/history/deleted/${panel.id}/permanent`
      );

      setPanels((previous) =>
        previous.filter(
          (item) => Number(item.id) !== Number(panel.id)
        )
      );

      if (
        selectedPanel &&
        Number(selectedPanel.id) === Number(panel.id)
      ) {
        closeDetails();
      }

      showMessage(
        'success',
        response?.data?.message ||
          `${panel.panel_name || 'Panel'} permanently deleted.`
      );
    } catch (error) {
      console.error('PERMANENT DELETE ERROR:', error);

      const status = error?.response?.status;

      if (status === 404) {
        showMessage(
          'error',
          'Permanent delete API is not available in the backend yet. Add DELETE /api/panels/history/deleted/:id/permanent to panels.js.'
        );
      } else {
        showMessage(
          'error',
          getErrorMessage(
            error,
            'Failed to permanently delete panel.'
          )
        );
      }
    } finally {
      setDeletingId(null);
    }
  };

  const executeConfirmedAction = () => {
    if (!confirmModal?.panel) return;

    if (confirmModal.type === 'restore') {
      handleRestore(confirmModal.panel);
      return;
    }

    if (confirmModal.type === 'permanent-delete') {
      handlePermanentDelete(confirmModal.panel);
    }
  };

  const formatDate = (value, includeTime = false) => {
    if (!value) return 'N/A';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    if (includeTime) {
      return date.toLocaleString();
    }

    return date.toLocaleDateString();
  };

  const getStatusClasses = (status) => {
    switch (String(status || '').toLowerCase()) {
      case 'live':
        return 'bg-green-500/10 text-green-400 border-green-500/20';

      case 'off':
        return 'bg-red-500/10 text-red-400 border-red-500/20';

      case 'maintenance':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';

      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const printPanel = (panel, details = null) => {
    const completePanel = details?.panel || panel || {};
    const history = Array.isArray(details?.history)
      ? details.history
      : [];

    const maintenance = Array.isArray(details?.maintenance)
      ? details.maintenance
      : [];

    const escapeHtml = (value) => {
      if (
        value === null ||
        value === undefined ||
        value === ''
      ) {
        return 'N/A';
      }

      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    };

    const specificationRows = [
      ['Panel ID', completePanel.id],
      ['Panel Code', completePanel.panel_code],
      ['Panel Name', completePanel.panel_name],
      ['Panel Type', completePanel.panel_type],
      ['Description', completePanel.description],
      ['Area', completePanel.area],
      ['Location', completePanel.location],
      ['Status', completePanel.status],
      ['Status Reason', completePanel.status_reason],

      ['Source Panel Code', completePanel.source_panel_code],
      ['Source Panel Name', completePanel.source_panel_name],

      ['Voltage', completePanel.voltage],
      ['Rated Current', completePanel.rated_current],
      ['Frequency', completePanel.frequency],
      ['Phase', completePanel.phase],

      ['Incomer Type', completePanel.incomer_type],
      ['Incomer Rating', completePanel.incomer_rating],

      ['Breaker Type', completePanel.breaker_type],
      ['Breaker Rating', completePanel.breaker_rating],
      ['Breaking Capacity', completePanel.breaking_capacity],

      ['Busbar Rating', completePanel.busbar_rating],
      ['Busbar Material', completePanel.busbar_material],

      ['Incoming Cable Size', completePanel.incoming_cable_size],
      ['Incoming Cable Type', completePanel.incoming_cable_type],
      ['Incoming Cable Cores', completePanel.incoming_cable_cores],
      ['Incoming Cable Length', completePanel.incoming_cable_length],

      ['Manufacturer', completePanel.manufacturer],
      ['Model', completePanel.model],
      ['Serial Number', completePanel.serial_number],
      ['IP Rating', completePanel.ip_rating],

      ['Installation Date', formatDate(completePanel.installation_date)],

      ['Short Circuit Rating', completePanel.short_circuit_rating],
      ['Insulation Voltage', completePanel.insulation_voltage],
      ['Control Voltage', completePanel.control_voltage],

      ['Earthing Details', completePanel.earthing_details],

      [
        'Last Maintenance Date',
        formatDate(completePanel.last_maintenance_date)
      ],

      [
        'Next Maintenance Date',
        formatDate(completePanel.next_maintenance_date)
      ],

      ['Map X Position', completePanel.x_position],
      ['Map Y Position', completePanel.y_position],
      ['Marker Width', completePanel.marker_width],
      ['Marker Height', completePanel.marker_height],

      ['Deleted At', formatDate(completePanel.deleted_at, true)],
      ['Deleted By', completePanel.deleted_by],
      ['Deletion Reason', completePanel.deletion_reason],

      ['Notes', completePanel.notes]
    ];

    const printWindow = window.open(
      '',
      '_blank',
      'width=1100,height=850'
    );

    if (!printWindow) {
      showMessage(
        'error',
        'Popup was blocked. Please allow popups to print the panel report.'
      );
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>
            ${escapeHtml(
              completePanel.panel_code || 'Panel'
            )} - Deleted Panel Report
          </title>

          <style>
            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              padding: 30px;
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
              background: white;
            }

            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 20px;
              border-bottom: 4px solid #eab308;
              padding-bottom: 18px;
              margin-bottom: 24px;
            }

            .brand {
              font-size: 28px;
              font-weight: 900;
              letter-spacing: -1px;
            }

            .brand span {
              color: #ca8a04;
            }

            .report-title {
              margin-top: 6px;
              color: #6b7280;
              font-size: 13px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 2px;
            }

            .archive-badge {
              padding: 10px 15px;
              border: 1px solid #ef4444;
              background: #fef2f2;
              color: #b91c1c;
              font-weight: 900;
              border-radius: 10px;
              text-transform: uppercase;
              font-size: 12px;
            }

            .panel-heading {
              margin-bottom: 20px;
              padding: 18px;
              background: #f8fafc;
              border: 1px solid #e5e7eb;
              border-radius: 12px;
            }

            .panel-heading h1 {
              margin: 0 0 7px;
              font-size: 24px;
            }

            .panel-heading p {
              margin: 0;
              color: #6b7280;
              font-size: 13px;
            }

            h2 {
              font-size: 16px;
              margin-top: 28px;
              margin-bottom: 12px;
              padding-bottom: 8px;
              border-bottom: 2px solid #e5e7eb;
              text-transform: uppercase;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }

            th,
            td {
              border: 1px solid #d1d5db;
              padding: 9px 10px;
              font-size: 12px;
              text-align: left;
              vertical-align: top;
            }

            th {
              width: 32%;
              background: #f3f4f6;
              font-weight: 800;
            }

            .footer {
              margin-top: 35px;
              padding-top: 15px;
              border-top: 1px solid #d1d5db;
              display: flex;
              justify-content: space-between;
              color: #6b7280;
              font-size: 10px;
            }

            @page {
              size: A4;
              margin: 12mm;
            }

            @media print {
              body {
                padding: 0;
              }

              .no-print {
                display: none;
              }
            }
          </style>
        </head>

        <body>
          <div class="header">
            <div>
              <div class="brand">
                POWER<span>HOUSE</span>
              </div>

              <div class="report-title">
                Deleted Electrical Panel Complete Report
              </div>
            </div>

            <div class="archive-badge">
              Archived / Deleted
            </div>
          </div>

          <div class="panel-heading">
            <h1>
              ${escapeHtml(completePanel.panel_name)}
            </h1>

            <p>
              Panel Code:
              <strong>
                ${escapeHtml(completePanel.panel_code)}
              </strong>
              &nbsp; | &nbsp;
              Database ID:
              <strong>
                #${escapeHtml(completePanel.id)}
              </strong>
            </p>
          </div>

          <h2>Complete Panel Specifications</h2>

          <table>
            <tbody>
              ${specificationRows
                .map(
                  ([label, value]) => `
                    <tr>
                      <th>${escapeHtml(label)}</th>
                      <td>${escapeHtml(value)}</td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>

          <h2>Status History</h2>

          ${
            history.length > 0
              ? `
                <table>
                  <thead>
                    <tr>
                      <th>Old Status</th>
                      <th>New Status</th>
                      <th>Reason</th>
                      <th>Started At</th>
                      <th>Ended At</th>
                      <th>Downtime Seconds</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${history
                      .map(
                        (item) => `
                          <tr>
                            <td>${escapeHtml(item.old_status)}</td>
                            <td>${escapeHtml(item.new_status)}</td>
                            <td>${escapeHtml(item.reason)}</td>
                            <td>${escapeHtml(
                              formatDate(item.started_at, true)
                            )}</td>
                            <td>${escapeHtml(
                              formatDate(item.ended_at, true)
                            )}</td>
                            <td>${escapeHtml(
                              item.downtime_seconds
                            )}</td>
                          </tr>
                        `
                      )
                      .join('')}
                  </tbody>
                </table>
              `
              : '<p>No status history available.</p>'
          }

          <h2>Maintenance History</h2>

          ${
            maintenance.length > 0
              ? `
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th>Created At</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${maintenance
                      .map(
                        (item) => `
                          <tr>
                            <td>${escapeHtml(item.id)}</td>
                            <td>${escapeHtml(
                              item.maintenance_type ||
                                item.type
                            )}</td>
                            <td>${escapeHtml(
                              item.description ||
                                item.notes
                            )}</td>
                            <td>${escapeHtml(
                              formatDate(
                                item.created_at,
                                true
                              )
                            )}</td>
                          </tr>
                        `
                      )
                      .join('')}
                  </tbody>
                </table>
              `
              : '<p>No maintenance history available.</p>'
          }

          <div class="footer">
            <span>
              PowerHouse Enterprise v1.2
            </span>

            <span>
              Printed:
              ${escapeHtml(new Date().toLocaleString())}
            </span>
          </div>

          <script>
            window.onload = function () {
              setTimeout(function () {
                window.print();
              }, 300);
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  const DetailItem = ({
    label,
    value,
    icon: Icon = Info
  }) => (
    <div className="bg-white/[0.025] border border-white/5 rounded-2xl p-4 min-w-0">
      <div className="flex items-center gap-2 text-slate-500 mb-2">
        <Icon size={14} />

        <p className="text-[9px] font-black uppercase tracking-[0.16em]">
          {label}
        </p>
      </div>

      <p className="text-white text-sm font-bold break-words">
        {value !== null &&
        value !== undefined &&
        value !== ''
          ? String(value)
          : 'N/A'}
      </p>
    </div>
  );

  const DetailSection = ({
    title,
    icon: Icon,
    children
  }) => (
    <div className="bg-[#020617] border border-white/5 rounded-[2rem] p-5 md:p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-yellow-500/10 rounded-xl flex items-center justify-center text-yellow-500">
          <Icon size={19} />
        </div>

        <h3 className="text-white font-black text-sm uppercase tracking-wider">
          {title}
        </h3>
      </div>

      {children}
    </div>
  );

  const activePanel =
    panelDetails?.panel ||
    selectedPanel ||
    null;

  const statusHistory = Array.isArray(panelDetails?.history)
    ? panelDetails.history
    : [];

  const maintenanceHistory = Array.isArray(
    panelDetails?.maintenance
  )
    ? panelDetails.maintenance
    : [];

  return (
    <div className="min-h-screen text-white animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-yellow-500 rounded-2xl flex items-center justify-center text-black shadow-lg shadow-yellow-500/20 shrink-0">
            <Archive size={24} />
          </div>

          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Panel History
            </h1>

            <p className="text-slate-500 text-sm mt-1">
              View, print, restore or permanently delete archived electrical panels
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => fetchDeletedPanels(true)}
            disabled={refreshing}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-slate-900 border border-white/10 rounded-xl text-sm font-bold text-white hover:bg-white/5 transition-all disabled:opacity-50"
          >
            <RefreshCw
              size={17}
              className={refreshing ? 'animate-spin' : ''}
            />

            Refresh
          </button>

          <button
            onClick={() => navigate('/panels')}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-yellow-500 hover:bg-yellow-400 rounded-xl text-sm font-black text-black transition-all shadow-lg shadow-yellow-500/10"
          >
            <ArrowLeft size={17} />
            Back to Panels
          </button>
        </div>
      </div>

      {/* MESSAGE */}
      {message.text && (
        <div
          className={`mb-6 flex items-start gap-3 p-4 rounded-2xl border ${
            message.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          )}

          <p className="text-sm font-bold">
            {message.text}
          </p>
        </div>
      )}

      {/* SUMMARY + SEARCH */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 mb-6">
        <div className="bg-[#020617] border border-white/5 rounded-[2rem] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-14 h-14 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-400">
            <Archive size={25} />
          </div>

          <div>
            <p className="text-3xl font-black text-white">
              {panels.length}
            </p>

            <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1">
              Deleted Panels
            </p>
          </div>
        </div>

        <div className="relative">
          <Search
            size={19}
            className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500"
          />

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by panel code, name, type, area, location, manufacturer, model..."
            className="w-full h-full min-h-[76px] bg-[#020617] border border-white/5 rounded-[2rem] pl-14 pr-5 text-white placeholder:text-slate-600 outline-none focus:border-yellow-500/40 transition-all"
          />
        </div>
      </div>

      {/* LOADING */}
      {loading ? (
        <div className="bg-[#020617] border border-white/5 rounded-[2rem] min-h-[350px] flex flex-col items-center justify-center">
          <RefreshCw
            size={36}
            className="text-yellow-500 animate-spin mb-4"
          />

          <p className="text-white font-black">
            Loading Panel History...
          </p>

          <p className="text-slate-500 text-sm mt-2">
            Fetching deleted electrical panel records
          </p>
        </div>
      ) : filteredPanels.length === 0 ? (
        <div className="bg-[#020617] border border-white/5 rounded-[2rem] p-10 text-center shadow-2xl">
          <div className="w-16 h-16 mx-auto mb-5 bg-yellow-500/10 rounded-2xl flex items-center justify-center text-yellow-500">
            <Archive size={30} />
          </div>

          <h2 className="text-xl font-black text-white mb-2">
            {search
              ? 'No Matching Panels Found'
              : 'No Deleted Panels'}
          </h2>

          <p className="text-slate-500 text-sm">
            {search
              ? 'Try changing your search keywords.'
              : 'Deleted and archived panel records will appear here.'}
          </p>
        </div>
      ) : (
        <div className="bg-[#020617] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">

          {/* DESKTOP TABLE */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="text-left px-6 py-5 text-[9px] text-slate-500 font-black uppercase tracking-[0.18em]">
                    Panel
                  </th>

                  <th className="text-left px-6 py-5 text-[9px] text-slate-500 font-black uppercase tracking-[0.18em]">
                    Type / Location
                  </th>

                  <th className="text-left px-6 py-5 text-[9px] text-slate-500 font-black uppercase tracking-[0.18em]">
                    Last Status
                  </th>

                  <th className="text-left px-6 py-5 text-[9px] text-slate-500 font-black uppercase tracking-[0.18em]">
                    Deleted Information
                  </th>

                  <th className="text-right px-6 py-5 text-[9px] text-slate-500 font-black uppercase tracking-[0.18em]">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredPanels.map((panel) => (
                  <tr
                    key={panel.id}
                    className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.025] transition-all"
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 bg-yellow-500/10 rounded-xl flex items-center justify-center text-yellow-500 shrink-0">
                          <CircuitBoard size={20} />
                        </div>

                        <div className="min-w-0">
                          <p className="text-white font-black text-sm truncate">
                            {panel.panel_name || 'Unnamed Panel'}
                          </p>

                          <p className="text-yellow-500 text-[10px] font-black uppercase mt-1">
                            {panel.panel_code || 'N/A'}
                            <span className="text-slate-600 ml-2">
                              #{panel.id}
                            </span>
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <p className="text-slate-300 text-xs font-bold">
                        {panel.panel_type || 'N/A'}
                      </p>

                      <p className="text-slate-500 text-[10px] mt-1 flex items-center gap-1.5">
                        <MapPin size={11} />
                        {panel.area ||
                          panel.location ||
                          'No location'}
                      </p>
                    </td>

                    <td className="px-6 py-5">
                      <span
                        className={`inline-flex px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${getStatusClasses(
                          panel.status
                        )}`}
                      >
                        {panel.status || 'Unknown'}
                      </span>
                    </td>

                    <td className="px-6 py-5">
                      <p className="text-slate-300 text-xs font-bold flex items-center gap-2">
                        <Calendar size={12} className="text-red-400" />
                        {formatDate(panel.deleted_at, true)}
                      </p>

                      <p className="text-slate-500 text-[10px] mt-1.5">
                        By: {panel.deleted_by || 'Not specified'}
                      </p>

                      {panel.deletion_reason && (
                        <p
                          className="text-slate-600 text-[10px] mt-1 max-w-[240px] truncate"
                          title={panel.deletion_reason}
                        >
                          Reason: {panel.deletion_reason}
                        </p>
                      )}
                    </td>

                    <td className="px-6 py-5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openPanelDetails(panel)}
                          title="View Complete Details"
                          className="w-10 h-10 bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white border border-blue-500/10 rounded-xl flex items-center justify-center transition-all"
                        >
                          <Eye size={17} />
                        </button>

                        <button
                          onClick={() => printPanel(panel)}
                          title="Print Panel"
                          className="w-10 h-10 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 rounded-xl flex items-center justify-center transition-all"
                        >
                          <Printer size={17} />
                        </button>

                        <button
                          onClick={() => requestRestore(panel)}
                          disabled={restoringId === panel.id}
                          title="Restore Panel"
                          className="w-10 h-10 bg-green-500/10 hover:bg-green-500 text-green-400 hover:text-white border border-green-500/10 rounded-xl flex items-center justify-center transition-all disabled:opacity-50"
                        >
                          <RotateCcw
                            size={17}
                            className={
                              restoringId === panel.id
                                ? 'animate-spin'
                                : ''
                            }
                          />
                        </button>

                        <button
                          onClick={() =>
                            requestPermanentDelete(panel)
                          }
                          disabled={deletingId === panel.id}
                          title="Permanently Delete"
                          className="w-10 h-10 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/10 rounded-xl flex items-center justify-center transition-all disabled:opacity-50"
                        >
                          {deletingId === panel.id ? (
                            <RefreshCw
                              size={17}
                              className="animate-spin"
                            />
                          ) : (
                            <Trash2 size={17} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MOBILE CARDS */}
          <div className="lg:hidden p-4 space-y-4">
            {filteredPanels.map((panel) => (
              <div
                key={panel.id}
                className="bg-white/[0.025] border border-white/5 rounded-[1.5rem] p-5"
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 bg-yellow-500/10 rounded-xl flex items-center justify-center text-yellow-500 shrink-0">
                    <CircuitBoard size={20} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-white font-black">
                      {panel.panel_name || 'Unnamed Panel'}
                    </p>

                    <p className="text-yellow-500 text-[10px] font-black uppercase mt-1">
                      {panel.panel_code || 'N/A'} · #{panel.id}
                    </p>
                  </div>

                  <span
                    className={`px-3 py-1 rounded-full border text-[8px] font-black uppercase ${getStatusClasses(
                      panel.status
                    )}`}
                  >
                    {panel.status || 'Unknown'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-5">
                  <div className="bg-black/10 rounded-xl p-3">
                    <p className="text-[8px] uppercase font-black text-slate-600">
                      Type
                    </p>

                    <p className="text-xs text-slate-300 font-bold mt-1">
                      {panel.panel_type || 'N/A'}
                    </p>
                  </div>

                  <div className="bg-black/10 rounded-xl p-3">
                    <p className="text-[8px] uppercase font-black text-slate-600">
                      Deleted
                    </p>

                    <p className="text-xs text-slate-300 font-bold mt-1">
                      {formatDate(panel.deleted_at)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 mt-4">
                  <button
                    onClick={() => openPanelDetails(panel)}
                    className="h-11 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center"
                  >
                    <Eye size={17} />
                  </button>

                  <button
                    onClick={() => printPanel(panel)}
                    className="h-11 bg-white/5 text-slate-300 rounded-xl flex items-center justify-center"
                  >
                    <Printer size={17} />
                  </button>

                  <button
                    onClick={() => requestRestore(panel)}
                    disabled={restoringId === panel.id}
                    className="h-11 bg-green-500/10 text-green-400 rounded-xl flex items-center justify-center disabled:opacity-50"
                  >
                    <RotateCcw
                      size={17}
                      className={
                        restoringId === panel.id
                          ? 'animate-spin'
                          : ''
                      }
                    />
                  </button>

                  <button
                    onClick={() =>
                      requestPermanentDelete(panel)
                    }
                    disabled={deletingId === panel.id}
                    className="h-11 bg-red-500/10 text-red-400 rounded-xl flex items-center justify-center disabled:opacity-50"
                  >
                    {deletingId === panel.id ? (
                      <RefreshCw
                        size={17}
                        className="animate-spin"
                      />
                    ) : (
                      <Trash2 size={17} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COMPLETE DETAILS MODAL */}
      {selectedPanel && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md p-3 md:p-6 overflow-y-auto"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDetails();
            }
          }}
        >
          <div className="max-w-6xl mx-auto bg-[#0a0f1e] border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden">

            {/* MODAL HEADER */}
            <div className="sticky top-0 z-20 bg-[#020617]/95 backdrop-blur-xl border-b border-white/5 p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 bg-yellow-500 rounded-2xl flex items-center justify-center text-black shrink-0">
                  <CircuitBoard size={23} />
                </div>

                <div className="min-w-0">
                  <h2 className="text-xl md:text-2xl text-white font-black truncate">
                    {activePanel?.panel_name ||
                      'Panel Details'}
                  </h2>

                  <p className="text-yellow-500 text-[10px] font-black uppercase tracking-wider mt-1">
                    {activePanel?.panel_code || 'N/A'}
                    {' · '}
                    Archived Panel #{activePanel?.id}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!detailsLoading && panelDetails && (
                  <>
                    <button
                      onClick={() =>
                        printPanel(activePanel, panelDetails)
                      }
                      className="h-11 px-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-white flex items-center gap-2 text-xs font-black transition-all"
                    >
                      <Printer size={16} />
                      Print
                    </button>

                    <button
                      onClick={() =>
                        requestRestore(activePanel)
                      }
                      className="h-11 px-4 bg-green-500/10 hover:bg-green-500 text-green-400 hover:text-white border border-green-500/10 rounded-xl flex items-center gap-2 text-xs font-black transition-all"
                    >
                      <RotateCcw size={16} />
                      Restore
                    </button>
                  </>
                )}

                <button
                  onClick={closeDetails}
                  className="w-11 h-11 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-xl flex items-center justify-center transition-all"
                >
                  <X size={19} />
                </button>
              </div>
            </div>

            {detailsLoading ? (
              <div className="min-h-[500px] flex flex-col items-center justify-center">
                <RefreshCw
                  size={38}
                  className="text-yellow-500 animate-spin mb-4"
                />

                <p className="text-white font-black">
                  Loading Complete Panel Data...
                </p>

                <p className="text-slate-500 text-sm mt-2">
                  Specifications, status history and maintenance records
                </p>
              </div>
            ) : panelDetails && activePanel ? (
              <div className="p-4 md:p-6 space-y-5">

                {/* DELETION WARNING */}
                <div className="bg-red-500/10 border border-red-500/20 rounded-[1.5rem] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <ShieldAlert
                      size={22}
                      className="text-red-400 shrink-0 mt-0.5"
                    />

                    <div>
                      <p className="text-red-400 font-black">
                        Archived / Deleted Panel
                      </p>

                      <p className="text-red-300/60 text-xs mt-1">
                        Deleted on{' '}
                        {formatDate(
                          activePanel.deleted_at,
                          true
                        )}
                        {' · '}
                        By:{' '}
                        {activePanel.deleted_by ||
                          'Not specified'}
                      </p>

                      {activePanel.deletion_reason && (
                        <p className="text-slate-400 text-xs mt-2">
                          Reason:{' '}
                          {activePanel.deletion_reason}
                        </p>
                      )}
                    </div>
                  </div>

                  <span
                    className={`self-start md:self-center px-4 py-2 rounded-full border text-[9px] font-black uppercase ${getStatusClasses(
                      activePanel.status
                    )}`}
                  >
                    Last Status: {activePanel.status}
                  </span>
                </div>

                {/* BASIC INFO */}
                <DetailSection
                  title="Basic Panel Information"
                  icon={CircuitBoard}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <DetailItem
                      label="Panel ID"
                      value={`#${activePanel.id}`}
                      icon={Hash}
                    />

                    <DetailItem
                      label="Panel Code"
                      value={activePanel.panel_code}
                      icon={Hash}
                    />

                    <DetailItem
                      label="Panel Name"
                      value={activePanel.panel_name}
                      icon={CircuitBoard}
                    />

                    <DetailItem
                      label="Panel Type"
                      value={activePanel.panel_type}
                      icon={Layers3}
                    />

                    <DetailItem
                      label="Area"
                      value={activePanel.area}
                      icon={Factory}
                    />

                    <DetailItem
                      label="Location"
                      value={activePanel.location}
                      icon={MapPin}
                    />

                    <DetailItem
                      label="Source Panel"
                      value={
                        activePanel.source_panel_name
                          ? `${activePanel.source_panel_code || ''} — ${activePanel.source_panel_name}`
                          : 'Main / Independent Supply'
                      }
                      icon={Server}
                    />

                    <DetailItem
                      label="Status Reason"
                      value={activePanel.status_reason}
                      icon={Info}
                    />
                  </div>

                  <div className="mt-3">
                    <DetailItem
                      label="Description"
                      value={activePanel.description}
                      icon={FileText}
                    />
                  </div>
                </DetailSection>

                {/* ELECTRICAL */}
                <DetailSection
                  title="Electrical Specifications"
                  icon={Zap}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <DetailItem
                      label="Voltage"
                      value={activePanel.voltage}
                      icon={Zap}
                    />

                    <DetailItem
                      label="Rated Current"
                      value={activePanel.rated_current}
                      icon={Activity}
                    />

                    <DetailItem
                      label="Frequency"
                      value={activePanel.frequency}
                      icon={Gauge}
                    />

                    <DetailItem
                      label="Phase"
                      value={activePanel.phase}
                      icon={Zap}
                    />

                    <DetailItem
                      label="Short Circuit Rating"
                      value={activePanel.short_circuit_rating}
                      icon={ShieldAlert}
                    />

                    <DetailItem
                      label="Insulation Voltage"
                      value={activePanel.insulation_voltage}
                      icon={ShieldAlert}
                    />

                    <DetailItem
                      label="Control Voltage"
                      value={activePanel.control_voltage}
                      icon={Zap}
                    />

                    <DetailItem
                      label="IP Rating"
                      value={activePanel.ip_rating}
                      icon={ShieldAlert}
                    />
                  </div>
                </DetailSection>

                {/* BREAKER / BUSBAR */}
                <DetailSection
                  title="Incomer, Breaker & Busbar"
                  icon={Cpu}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <DetailItem
                      label="Incomer Type"
                      value={activePanel.incomer_type}
                      icon={Cpu}
                    />

                    <DetailItem
                      label="Incomer Rating"
                      value={activePanel.incomer_rating}
                      icon={Gauge}
                    />

                    <DetailItem
                      label="Breaker Type"
                      value={activePanel.breaker_type}
                      icon={Cpu}
                    />

                    <DetailItem
                      label="Breaker Rating"
                      value={activePanel.breaker_rating}
                      icon={Gauge}
                    />

                    <DetailItem
                      label="Breaking Capacity"
                      value={activePanel.breaking_capacity}
                      icon={ShieldAlert}
                    />

                    <DetailItem
                      label="Busbar Rating"
                      value={activePanel.busbar_rating}
                      icon={Activity}
                    />

                    <DetailItem
                      label="Busbar Material"
                      value={activePanel.busbar_material}
                      icon={Layers3}
                    />
                  </div>
                </DetailSection>

                {/* CABLE */}
                <DetailSection
                  title="Incoming Cable Specifications"
                  icon={Cable}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <DetailItem
                      label="Cable Size"
                      value={activePanel.incoming_cable_size}
                      icon={Cable}
                    />

                    <DetailItem
                      label="Cable Type"
                      value={activePanel.incoming_cable_type}
                      icon={Cable}
                    />

                    <DetailItem
                      label="Cable Cores"
                      value={activePanel.incoming_cable_cores}
                      icon={Cable}
                    />

                    <DetailItem
                      label="Cable Length"
                      value={activePanel.incoming_cable_length}
                      icon={Cable}
                    />
                  </div>
                </DetailSection>

                {/* MANUFACTURER */}
                <DetailSection
                  title="Manufacturer & Installation"
                  icon={Factory}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <DetailItem
                      label="Manufacturer"
                      value={activePanel.manufacturer}
                      icon={Factory}
                    />

                    <DetailItem
                      label="Model"
                      value={activePanel.model}
                      icon={Cpu}
                    />

                    <DetailItem
                      label="Serial Number"
                      value={activePanel.serial_number}
                      icon={Hash}
                    />

                    <DetailItem
                      label="Installation Date"
                      value={formatDate(
                        activePanel.installation_date
                      )}
                      icon={Calendar}
                    />
                  </div>
                </DetailSection>

                {/* MAINTENANCE */}
                <DetailSection
                  title="Maintenance & Earthing"
                  icon={Wrench}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <DetailItem
                      label="Last Maintenance"
                      value={formatDate(
                        activePanel.last_maintenance_date
                      )}
                      icon={Calendar}
                    />

                    <DetailItem
                      label="Next Maintenance"
                      value={formatDate(
                        activePanel.next_maintenance_date
                      )}
                      icon={Calendar}
                    />

                    <DetailItem
                      label="Earthing Details"
                      value={activePanel.earthing_details}
                      icon={ShieldAlert}
                    />
                  </div>

                  <div className="mt-3">
                    <DetailItem
                      label="Notes"
                      value={activePanel.notes}
                      icon={FileText}
                    />
                  </div>
                </DetailSection>

                {/* MAP POSITION */}
                <DetailSection
                  title="Map Position & Marker Size"
                  icon={MapPin}
                >
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <DetailItem
                      label="X Position"
                      value={activePanel.x_position}
                      icon={MapPin}
                    />

                    <DetailItem
                      label="Y Position"
                      value={activePanel.y_position}
                      icon={MapPin}
                    />

                    <DetailItem
                      label="Marker Width"
                      value={activePanel.marker_width}
                      icon={Layers3}
                    />

                    <DetailItem
                      label="Marker Height"
                      value={activePanel.marker_height}
                      icon={Layers3}
                    />
                  </div>
                </DetailSection>

                {/* STATUS HISTORY */}
                <DetailSection
                  title={`Status History (${statusHistory.length})`}
                  icon={Clock}
                >
                  {statusHistory.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[750px]">
                        <thead>
                          <tr className="border-b border-white/5">
                            <th className="text-left py-3 px-3 text-[9px] uppercase tracking-wider text-slate-500">
                              Old
                            </th>

                            <th className="text-left py-3 px-3 text-[9px] uppercase tracking-wider text-slate-500">
                              New
                            </th>

                            <th className="text-left py-3 px-3 text-[9px] uppercase tracking-wider text-slate-500">
                              Reason
                            </th>

                            <th className="text-left py-3 px-3 text-[9px] uppercase tracking-wider text-slate-500">
                              Started
                            </th>

                            <th className="text-left py-3 px-3 text-[9px] uppercase tracking-wider text-slate-500">
                              Ended
                            </th>

                            <th className="text-left py-3 px-3 text-[9px] uppercase tracking-wider text-slate-500">
                              Downtime
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {statusHistory.map((item) => (
                            <tr
                              key={item.id}
                              className="border-b border-white/5 last:border-0"
                            >
                              <td className="px-3 py-4 text-xs text-slate-400 uppercase">
                                {item.old_status || 'N/A'}
                              </td>

                              <td className="px-3 py-4">
                                <span
                                  className={`px-2.5 py-1 rounded-full border text-[8px] font-black uppercase ${getStatusClasses(
                                    item.new_status
                                  )}`}
                                >
                                  {item.new_status || 'N/A'}
                                </span>
                              </td>

                              <td className="px-3 py-4 text-xs text-slate-400">
                                {item.reason || 'N/A'}
                              </td>

                              <td className="px-3 py-4 text-xs text-slate-400">
                                {formatDate(
                                  item.started_at,
                                  true
                                )}
                              </td>

                              <td className="px-3 py-4 text-xs text-slate-400">
                                {formatDate(
                                  item.ended_at,
                                  true
                                )}
                              </td>

                              <td className="px-3 py-4 text-xs text-yellow-500 font-bold">
                                {item.downtime_seconds
                                  ? `${item.downtime_seconds}s`
                                  : '0s'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm text-center py-8">
                      No status history available.
                    </p>
                  )}
                </DetailSection>

                {/* MAINTENANCE HISTORY */}
                <DetailSection
                  title={`Maintenance History (${maintenanceHistory.length})`}
                  icon={Wrench}
                >
                  {maintenanceHistory.length > 0 ? (
                    <div className="space-y-3">
                      {maintenanceHistory.map((item) => (
                        <div
                          key={item.id}
                          className="bg-white/[0.025] border border-white/5 rounded-2xl p-4"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <p className="text-white font-bold text-sm">
                                {item.maintenance_type ||
                                  item.type ||
                                  `Maintenance #${item.id}`}
                              </p>

                              <p className="text-slate-500 text-xs mt-1">
                                {item.description ||
                                  item.notes ||
                                  'No description'}
                              </p>
                            </div>

                            <span className="text-[10px] text-yellow-500 font-bold flex items-center gap-1.5">
                              <Calendar size={12} />

                              {formatDate(
                                item.created_at,
                                true
                              )}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm text-center py-8">
                      No maintenance history available.
                    </p>
                  )}
                </DetailSection>

                {/* BOTTOM ACTIONS */}
                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
                  <button
                    onClick={() =>
                      printPanel(activePanel, panelDetails)
                    }
                    className="px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-white font-black text-xs flex items-center justify-center gap-2 transition-all"
                  >
                    <Printer size={16} />
                    Print Complete Report
                  </button>

                  <button
                    onClick={() =>
                      requestRestore(activePanel)
                    }
                    className="px-5 py-3 bg-green-500 hover:bg-green-400 rounded-xl text-black font-black text-xs flex items-center justify-center gap-2 transition-all"
                  >
                    <RotateCcw size={16} />
                    Restore Panel
                  </button>

                  <button
                    onClick={() =>
                      requestPermanentDelete(activePanel)
                    }
                    className="px-5 py-3 bg-red-500/10 hover:bg-red-500 border border-red-500/20 rounded-xl text-red-400 hover:text-white font-black text-xs flex items-center justify-center gap-2 transition-all"
                  >
                    <Trash2 size={16} />
                    Permanent Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="min-h-[350px] flex items-center justify-center text-slate-500">
                Unable to load panel details.
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmModal && (
        <div className="fixed inset-0 z-[300] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0a0f1e] border border-white/10 rounded-[2rem] shadow-2xl p-6 md:p-7">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${
                confirmModal.type === 'restore'
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}
            >
              {confirmModal.type === 'restore' ? (
                <RotateCcw size={26} />
              ) : (
                <ShieldAlert size={26} />
              )}
            </div>

            <h3 className="text-xl text-white font-black">
              {confirmModal.title}
            </h3>

            <p className="text-slate-400 text-sm leading-6 mt-3">
              {confirmModal.message}
            </p>

            <div className="mt-5 bg-white/[0.025] border border-white/5 rounded-2xl p-4">
              <p className="text-white font-black text-sm">
                {confirmModal.panel?.panel_name ||
                  'Unnamed Panel'}
              </p>

              <p className="text-yellow-500 text-[10px] font-black uppercase mt-1">
                {confirmModal.panel?.panel_code || 'N/A'}
                {' · '}
                ID #{confirmModal.panel?.id}
              </p>
            </div>

            {confirmModal.type === 'permanent-delete' && (
              <div className="mt-4 flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                <AlertTriangle
                  size={19}
                  className="text-red-400 shrink-0 mt-0.5"
                />

                <p className="text-red-300 text-xs leading-5">
                  Warning: Permanent deletion cannot be undone. Restore the panel instead if you may need its complete data later.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-white text-xs font-black transition-all"
              >
                Cancel
              </button>

              <button
                onClick={executeConfirmedAction}
                className={`px-4 py-3 rounded-xl text-xs font-black transition-all ${
                  confirmModal.type === 'restore'
                    ? 'bg-green-500 hover:bg-green-400 text-black'
                    : 'bg-red-500 hover:bg-red-400 text-white'
                }`}
              >
                {confirmModal.type === 'restore'
                  ? 'Yes, Restore'
                  : 'Yes, Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}