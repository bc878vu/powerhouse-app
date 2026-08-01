import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import factoryMap from './assets/factory-map.svg';
import API from './api';
import { socket } from './utils/socket';
import {
  Map,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  ExternalLink,
  Scan,
  RefreshCw,
  Search,
  X,
  Activity,
  Zap,
  Power,
  Wrench,
  AlertTriangle,
  Cable,
  Eye,
  EyeOff,
  MapPin,
  Gauge,
  Clock,
  CalendarDays,
  Network,
  Cpu,
  ShieldCheck,
  Factory,
  Route,
  Info,
  ChevronRight
} from 'lucide-react';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.15;
const FIT_PADDING = 24;

const STATUS_CONFIG = {
  live: {
    label: 'Live',
    color: '#22c55e',
    bg: 'bg-green-500',
    text: 'text-green-400',
    soft: 'bg-green-500/10',
    border: 'border-green-500/30',
    icon: Zap
  },
  off: {
    label: 'Off',
    color: '#ef4444',
    bg: 'bg-red-500',
    text: 'text-red-400',
    soft: 'bg-red-500/10',
    border: 'border-red-500/30',
    icon: Power
  },
  maintenance: {
    label: 'Maintenance',
    color: '#eab308',
    bg: 'bg-yellow-500',
    text: 'text-yellow-400',
    soft: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    icon: Wrench
  },
  affected: {
    label: 'Affected',
    color: '#f97316',
    bg: 'bg-orange-500',
    text: 'text-orange-400',
    soft: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    icon: AlertTriangle
  },
  unknown: {
    label: 'Unknown',
    color: '#64748b',
    bg: 'bg-slate-500',
    text: 'text-slate-400',
    soft: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    icon: Info
  }
};

const safeNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const formatValue = (value, suffix = '') => {
  if (value === undefined || value === null || value === '') return 'N/A';
  return `${value}${suffix}`;
};

const formatDate = (value) => {
  if (!value) return 'N/A';

  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return 'N/A';
  }
};

const formatDateTime = (value) => {
  if (!value) return 'N/A';

  try {
    return new Date(value).toLocaleString();
  } catch {
    return 'N/A';
  }
};

const formatDuration = (seconds) => {
  const totalSeconds = Math.max(0, Number(seconds) || 0);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;

  return `${totalSeconds}s`;
};

const parseRoutePoints = (value) => {
  if (Array.isArray(value)) return value;

  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export default function InteractivePanelMap() {
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [imageSize, setImageSize] = useState({
    width: 0,
    height: 0
  });

  const [imageLoaded, setImageLoaded] = useState(false);

  const [panels, setPanels] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [networkPanels, setNetworkPanels] = useState([]);

  const [selectedPanel, setSelectedPanel] = useState(null);
  const [selectedPanelDetails, setSelectedPanelDetails] = useState(null);
  const [selectedStats, setSelectedStats] = useState(null);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const [showAllCables, setShowAllCables] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const mapContainerRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const imageRef = useRef(null);

  const getEffectiveStatus = useCallback(
    (panel) => {
      const networkPanel = networkPanels.find(
        (item) => Number(item.id) === Number(panel.id)
      );

      return (
        networkPanel?.effective_status ||
        panel.effective_status ||
        panel.status ||
        'unknown'
      ).toLowerCase();
    },
    [networkPanels]
  );

  const fetchMapData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);

    setError('');

    try {
      const results = await Promise.allSettled([
        API.get('/panels'),
        API.get('/panels/routes/all'),
        API.get('/panels/network/status')
      ]);

      const panelsResult = results[0];
      const routesResult = results[1];
      const networkResult = results[2];

      if (panelsResult.status === 'fulfilled') {
        const data = panelsResult.value.data;

        setPanels(
          Array.isArray(data)
            ? data
            : Array.isArray(data?.panels)
              ? data.panels
              : []
        );
      } else {
        console.error('Panels fetch error:', panelsResult.reason);
      }

      if (routesResult.status === 'fulfilled') {
        const data = routesResult.value.data;

        const routeList = Array.isArray(data)
          ? data
          : Array.isArray(data?.routes)
            ? data.routes
            : [];

        setRoutes(
          routeList.map((route) => ({
            ...route,
            route_points: parseRoutePoints(route.route_points)
          }))
        );
      } else {
        console.error('Routes fetch error:', routesResult.reason);
      }

      if (networkResult.status === 'fulfilled') {
        const data = networkResult.value.data;

        setNetworkPanels(
          Array.isArray(data)
            ? data
            : Array.isArray(data?.panels)
              ? data.panels
              : []
        );
      } else {
        console.error('Network status fetch error:', networkResult.reason);
      }

      if (
        panelsResult.status === 'rejected' &&
        routesResult.status === 'rejected' &&
        networkResult.status === 'rejected'
      ) {
        setError('Could not load panel map data from server.');
      }
    } catch (err) {
      console.error('Map data fetch error:', err);
      setError(err?.response?.data?.message || 'Failed to load map data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMapData();
  }, [fetchMapData]);

  useEffect(() => {
    const refreshMap = () => {
      fetchMapData(false);
    };

    socket.on('panelCreated', refreshMap);
    socket.on('panelUpdated', refreshMap);
    socket.on('panelStatusUpdated', refreshMap);
    socket.on('panelDeleted', refreshMap);
    socket.on('cableRouteCreated', refreshMap);
    socket.on('cableRouteUpdated', refreshMap);
    socket.on('cableRouteDeleted', refreshMap);
    socket.on('panelNetworkUpdated', refreshMap);

    return () => {
      socket.off('panelCreated', refreshMap);
      socket.off('panelUpdated', refreshMap);
      socket.off('panelStatusUpdated', refreshMap);
      socket.off('panelDeleted', refreshMap);
      socket.off('cableRouteCreated', refreshMap);
      socket.off('cableRouteUpdated', refreshMap);
      socket.off('cableRouteDeleted', refreshMap);
      socket.off('panelNetworkUpdated', refreshMap);
    };
  }, [fetchMapData]);

  const panelCounts = useMemo(() => {
    const counts = {
      total: panels.length,
      live: 0,
      off: 0,
      maintenance: 0,
      affected: 0
    };

    panels.forEach((panel) => {
      const status = getEffectiveStatus(panel);

      if (Object.prototype.hasOwnProperty.call(counts, status)) {
        counts[status] += 1;
      }
    });

    return counts;
  }, [panels, getEffectiveStatus]);

  const filteredPanels = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return panels.filter((panel) => {
      const status = getEffectiveStatus(panel);

      const matchesStatus =
        statusFilter === 'all' || status === statusFilter;

      const searchableText = [
        panel.panel_code,
        panel.panel_name,
        panel.panel_type,
        panel.area,
        panel.location
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        !normalizedSearch ||
        searchableText.includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [panels, search, statusFilter, getEffectiveStatus]);

  const selectedRouteIds = useMemo(() => {
    if (!selectedPanel) return new Set();

    const selectedId = Number(selectedPanel.id);

    const ids = routes
      .filter(
        (route) =>
          Number(route.source_panel_id) === selectedId ||
          Number(route.destination_panel_id) === selectedId
      )
      .map((route) => Number(route.id));

    return new Set(ids);
  }, [selectedPanel, routes]);

  const visibleRoutes = useMemo(() => {
    if (showAllCables) return routes;

    if (!selectedPanel) return [];

    return routes.filter((route) =>
      selectedRouteIds.has(Number(route.id))
    );
  }, [routes, showAllCables, selectedPanel, selectedRouteIds]);

  const fitToScreen = useCallback(() => {
    const container = scrollAreaRef.current;
    const image = imageRef.current;

    if (!container || !image) return;

    const naturalWidth = image.naturalWidth || imageSize.width;
    const naturalHeight = image.naturalHeight || imageSize.height;

    if (!naturalWidth || !naturalHeight) return;

    const availableWidth = Math.max(
      container.clientWidth - FIT_PADDING * 2,
      1
    );

    const availableHeight = Math.max(
      container.clientHeight - FIT_PADDING * 2,
      1
    );

    const widthZoom = availableWidth / naturalWidth;
    const heightZoom = availableHeight / naturalHeight;

    const calculatedZoom = Math.min(widthZoom, heightZoom);

    const safeZoom = Math.max(
      MIN_ZOOM,
      Math.min(calculatedZoom, MAX_ZOOM)
    );

    setZoom(Number(safeZoom.toFixed(4)));

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTo({
            top: 0,
            left: 0,
            behavior: 'auto'
          });
        }
      });
    });
  }, [imageSize.width, imageSize.height]);

  const handleImageLoad = () => {
    const image = imageRef.current;

    if (!image) return;

    setImageSize({
      width: image.naturalWidth,
      height: image.naturalHeight
    });

    setImageLoaded(true);
  };

  useEffect(() => {
    if (!imageLoaded) return undefined;

    const timer = setTimeout(() => {
      fitToScreen();
    }, 100);

    return () => clearTimeout(timer);
  }, [
    imageLoaded,
    imageSize.width,
    imageSize.height,
    fitToScreen
  ]);

  useEffect(() => {
    if (!imageLoaded) return undefined;

    let resizeTimer;

    const handleResize = () => {
      clearTimeout(resizeTimer);

      resizeTimer = setTimeout(() => {
        fitToScreen();
      }, 150);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, [imageLoaded, fitToScreen]);

  const zoomIn = () => {
    setZoom((previous) =>
      Number(
        Math.min(previous + ZOOM_STEP, MAX_ZOOM).toFixed(4)
      )
    );
  };

  const zoomOut = () => {
    setZoom((previous) =>
      Number(
        Math.max(previous - ZOOM_STEP, MIN_ZOOM).toFixed(4)
      )
    );
  };

  const resetZoom = () => {
    setZoom(1);

    requestAnimationFrame(() => {
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTo({
          top: 0,
          left: 0,
          behavior: 'smooth'
        });
      }
    });
  };

  const openFullScreen = async () => {
    const element = mapContainerRef.current;

    if (!element) return;

    try {
      if (!document.fullscreenElement) {
        await element.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));

      setTimeout(() => {
        fitToScreen();
      }, 200);
    };

    document.addEventListener(
      'fullscreenchange',
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenChange
      );
    };
  }, [fitToScreen]);

  const openSvgNewTab = () => {
    window.open(factoryMap, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    const container = scrollAreaRef.current;

    if (!container) return undefined;

    const handleWheel = (event) => {
      if (!event.ctrlKey) return;

      event.preventDefault();

      setZoom((previous) => {
        const nextZoom =
          event.deltaY < 0
            ? Math.min(previous + ZOOM_STEP, MAX_ZOOM)
            : Math.max(previous - ZOOM_STEP, MIN_ZOOM);

        return Number(nextZoom.toFixed(4));
      });
    };

    container.addEventListener('wheel', handleWheel, {
      passive: false
    });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const handlePanelClick = async (panel) => {
    setSelectedPanel(panel);
    setSelectedPanelDetails(null);
    setSelectedStats(null);
    setDetailLoading(true);

    try {
      const results = await Promise.allSettled([
        API.get(`/panels/${panel.id}`),
        API.get(`/panels/${panel.id}/stats`)
      ]);

      if (results[0].status === 'fulfilled') {
        setSelectedPanelDetails(results[0].value.data);
      }

      if (results[1].status === 'fulfilled') {
        setSelectedStats(results[1].value.data);
      }
    } catch (err) {
      console.error('Panel details error:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closePanelDetails = () => {
    setSelectedPanel(null);
    setSelectedPanelDetails(null);
    setSelectedStats(null);
  };

  const displayedMapWidth =
    imageSize.width > 0 ? imageSize.width * zoom : 0;

  const displayedMapHeight =
    imageSize.height > 0 ? imageSize.height * zoom : 0;

  const getPanelPosition = (panel) => {
    return {
      left: `${safeNumber(panel.x_position, 50)}%`,
      top: `${safeNumber(panel.y_position, 50)}%`
    };
  };

  const getPanelMarkerSize = (panel) => {
    const width = Math.max(
      20,
      safeNumber(panel.marker_width, 3) * zoom * 8
    );

    const height = Math.max(
      20,
      safeNumber(panel.marker_height, 3) * zoom * 8
    );

    return {
      width: `${width}px`,
      height: `${height}px`
    };
  };

  const getRoutePolylinePoints = (route) => {
    const points = parseRoutePoints(route.route_points);

    return points
      .map((point) => {
        const x = safeNumber(
          point.x ?? point.x_position ?? point.left,
          0
        );

        const y = safeNumber(
          point.y ?? point.y_position ?? point.top,
          0
        );

        return `${x},${y}`;
      })
      .join(' ');
  };

  const selectedFullPanel =
    selectedPanelDetails?.panel || selectedPanel;

  const selectedStatus = selectedFullPanel
    ? getEffectiveStatus(selectedFullPanel)
    : 'unknown';

  const selectedStatusConfig =
    STATUS_CONFIG[selectedStatus] || STATUS_CONFIG.unknown;

  const DetailItem = ({
    label,
    value,
    icon: Icon = ChevronRight
  }) => (
    <div className="flex items-start gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-2xl">
      <div className="w-8 h-8 shrink-0 rounded-xl bg-yellow-500/10 text-yellow-400 flex items-center justify-center">
        <Icon size={14} />
      </div>

      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wider text-slate-500 font-black">
          {label}
        </p>

        <p className="text-sm text-white font-bold mt-1 break-words">
          {value ?? 'N/A'}
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 shrink-0 bg-yellow-500 rounded-2xl flex items-center justify-center text-black shadow-lg shadow-yellow-500/20">
            <Map size={24} />
          </div>

          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
              Interactive Panel Map
            </h1>

            <p className="text-slate-500 text-sm mt-1">
              Live PowerHouse Factory Electrical Network Monitoring
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => fetchMapData(true)}
            disabled={loading}
            className="p-3 bg-white/5 hover:bg-yellow-500 hover:text-black border border-white/10 rounded-xl transition-all disabled:opacity-40"
            title="Refresh Map Data"
          >
            <RefreshCw
              size={18}
              className={loading ? 'animate-spin' : ''}
            />
          </button>

          <button
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="p-3 bg-white/5 hover:bg-yellow-500 hover:text-black border border-white/10 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            title="Zoom Out"
          >
            <ZoomOut size={18} />
          </button>

          <div className="min-w-[80px] text-center px-3 py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-black text-yellow-500">
            {Math.round(zoom * 100)}%
          </div>

          <button
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="p-3 bg-white/5 hover:bg-yellow-500 hover:text-black border border-white/10 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            title="Zoom In"
          >
            <ZoomIn size={18} />
          </button>

          <button
            onClick={resetZoom}
            className="p-3 bg-white/5 hover:bg-yellow-500 hover:text-black border border-white/10 rounded-xl transition-all"
            title="Reset to 100%"
          >
            <RotateCcw size={18} />
          </button>

          <button
            onClick={fitToScreen}
            className="p-3 bg-white/5 hover:bg-yellow-500 hover:text-black border border-white/10 rounded-xl transition-all"
            title="Fit Complete Map to Screen"
          >
            <Scan size={18} />
          </button>

          <button
            onClick={openFullScreen}
            className="p-3 bg-white/5 hover:bg-yellow-500 hover:text-black border border-white/10 rounded-xl transition-all"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            <Maximize2 size={18} />
          </button>

          <button
            onClick={openSvgNewTab}
            className="flex items-center gap-2 px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-yellow-500/10"
          >
            <ExternalLink size={17} />
            Open Map
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          {
            label: 'Total Panels',
            value: panelCounts.total,
            status: 'unknown',
            icon: LayoutPanelIcon
          },
          {
            label: 'Live',
            value: panelCounts.live,
            status: 'live',
            icon: Zap
          },
          {
            label: 'Off',
            value: panelCounts.off,
            status: 'off',
            icon: Power
          },
          {
            label: 'Maintenance',
            value: panelCounts.maintenance,
            status: 'maintenance',
            icon: Wrench
          },
          {
            label: 'Affected',
            value: panelCounts.affected,
            status: 'affected',
            icon: AlertTriangle
          }
        ].map((item) => {
          const config =
            STATUS_CONFIG[item.status] || STATUS_CONFIG.unknown;

          const Icon = item.icon;

          return (
            <button
              type="button"
              key={item.label}
              onClick={() =>
                setStatusFilter(
                  item.label === 'Total Panels'
                    ? 'all'
                    : item.status
                )
              }
              className={`text-left p-4 rounded-2xl border transition-all ${
                statusFilter === item.status ||
                (item.label === 'Total Panels' &&
                  statusFilter === 'all')
                  ? `${config.soft} ${config.border}`
                  : 'bg-[#020617] border-white/5 hover:border-white/10'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">
                    {item.label}
                  </p>

                  <p className={`text-3xl font-black mt-2 ${config.text}`}>
                    {item.value}
                  </p>
                </div>

                <div className={`w-10 h-10 rounded-xl ${config.soft} ${config.text} flex items-center justify-center`}>
                  <Icon size={19} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 py-4 bg-[#020617] border border-white/5 rounded-2xl">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>

            <div>
              <p className="text-xs font-black text-white uppercase tracking-wider">
                Factory Map Online
              </p>

              <p className="text-[10px] text-slate-500 mt-0.5">
                {panels.length} panels • {routes.length} cable routes
              </p>
            </div>
          </div>

          <div className="hidden md:block w-px h-8 bg-white/10" />

          <div className="flex flex-wrap gap-3">
            {[
              ['Live', '#22c55e'],
              ['Off', '#ef4444'],
              ['Maintenance', '#eab308'],
              ['Affected', '#f97316']
            ].map(([label, color]) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />

                <span className="text-[9px] text-slate-400 uppercase font-black">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search panel..."
              className="w-full sm:w-56 bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-xs text-white outline-none focus:border-yellow-500/50"
            />
          </div>

          <button
            onClick={() => setShowAllCables((previous) => !previous)}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-[10px] uppercase tracking-wider font-black transition-all ${
              showAllCables
                ? 'bg-yellow-500 text-black border-yellow-500'
                : 'bg-white/5 text-slate-300 border-white/10 hover:border-yellow-500/40'
            }`}
          >
            {showAllCables ? <EyeOff size={16} /> : <Eye size={16} />}
            {showAllCables ? 'Hide Cables' : 'Show All Cables'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-bold flex items-center gap-3">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <div
        ref={mapContainerRef}
        id="factory-map-container"
        className="relative bg-white border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl fullscreen:rounded-none"
      >
        <div className="absolute top-4 left-4 z-30 px-4 py-2 bg-[#020617]/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-xl pointer-events-none">
          <p className="text-yellow-500 text-[10px] font-black uppercase tracking-[0.2em]">
            Live Factory Layout
          </p>

          <p className="text-slate-400 text-[9px] mt-1">
            Click any panel to view route & specifications
          </p>
        </div>

        {loading && (
          <div className="absolute inset-0 z-50 bg-[#020617]/70 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <RefreshCw
                size={30}
                className="text-yellow-500 animate-spin"
              />

              <p className="text-white text-xs uppercase tracking-widest font-black">
                Loading Electrical Network
              </p>
            </div>
          </div>
        )}

        <div
          ref={scrollAreaRef}
          className={`w-full overflow-auto bg-slate-100 scroll-smooth ${
            isFullscreen
              ? 'h-screen'
              : 'h-[72vh] min-h-[550px]'
          }`}
        >
          <div className="min-w-full min-h-full flex items-center justify-center p-6">
            <div
              className="relative shrink-0 transition-[width,height] duration-300 ease-out"
              style={{
                width: imageLoaded
                  ? `${displayedMapWidth}px`
                  : '100%',
                height: imageLoaded
                  ? `${displayedMapHeight}px`
                  : 'auto'
              }}
            >
              <img
                ref={imageRef}
                src={factoryMap}
                alt="PowerHouse Factory Map"
                onLoad={handleImageLoad}
                className="block w-full h-full object-contain select-none pointer-events-none"
                draggable="false"
              />

              {imageLoaded && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-10"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  {visibleRoutes.map((route) => {
                    const points = getRoutePolylinePoints(route);

                    if (!points) return null;

                    const isHighlighted =
                      selectedRouteIds.has(Number(route.id));

                    const lineColor = isHighlighted
                      ? route.highlight_color || '#facc15'
                      : route.default_color || '#64748b';

                    const lineWidth = isHighlighted
                      ? Math.max(
                          safeNumber(route.line_width, 4) * 0.12,
                          0.6
                        )
                      : Math.max(
                          safeNumber(route.line_width, 4) * 0.08,
                          0.35
                        );

                    return (
                      <g key={route.id}>
                        {isHighlighted && (
                          <polyline
                            points={points}
                            fill="none"
                            stroke="#ffffff"
                            strokeOpacity="0.9"
                            strokeWidth={lineWidth + 0.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}

                        <polyline
                          points={points}
                          fill="none"
                          stroke={lineColor}
                          strokeWidth={lineWidth}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray={
                            route.route_type === 'underground'
                              ? '1 0.8'
                              : undefined
                          }
                        />
                      </g>
                    );
                  })}
                </svg>
              )}

              {imageLoaded &&
                filteredPanels.map((panel) => {
                  const status = getEffectiveStatus(panel);

                  const config =
                    STATUS_CONFIG[status] || STATUS_CONFIG.unknown;

                  const isSelected =
                    Number(selectedPanel?.id) === Number(panel.id);

                  return (
                    <button
                      type="button"
                      key={panel.id}
                      onClick={() => handlePanelClick(panel)}
                      className="absolute z-20 -translate-x-1/2 -translate-y-1/2 group"
                      style={getPanelPosition(panel)}
                      title={`${panel.panel_code} - ${panel.panel_name}`}
                    >
                      <span
                        className="absolute inset-[-8px] rounded-full opacity-30 animate-ping"
                        style={{
                          backgroundColor: config.color,
                          display:
                            status === 'live' ? 'block' : 'none'
                        }}
                      />

                      <span
                        className={`relative flex items-center justify-center rounded-xl border-2 shadow-2xl transition-all duration-200 group-hover:scale-125 ${
                          isSelected
                            ? 'scale-125 ring-4 ring-yellow-400/40'
                            : ''
                        }`}
                        style={{
                          ...getPanelMarkerSize(panel),
                          backgroundColor: config.color,
                          borderColor: '#ffffff',
                          boxShadow: `0 0 ${
                            isSelected ? 24 : 12
                          }px ${config.color}`
                        }}
                      >
                        <Zap
                          size={Math.max(10, 14 * zoom)}
                          className="text-white drop-shadow"
                        />
                      </span>

                      <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap px-2.5 py-1.5 bg-[#020617]/95 text-white border border-white/10 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <span className="block text-[9px] font-black text-yellow-400">
                          {panel.panel_code}
                        </span>

                        <span className="block text-[8px] text-slate-300 mt-0.5">
                          {panel.panel_name}
                        </span>

                        <span
                          className="block text-[8px] font-black uppercase mt-1"
                          style={{ color: config.color }}
                        >
                          {config.label}
                        </span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 right-4 z-30 px-3 py-2 bg-[#020617]/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-xl pointer-events-none">
          <span className="text-yellow-500 text-[10px] font-black tracking-wider">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-2">
        <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold">
          Tip: Hold Ctrl + Mouse Wheel to zoom • Click panel to highlight route
        </p>

        <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold">
          Auto Fit Active • Zoom Range: 5% — 300%
        </p>
      </div>

      {selectedPanel && (
        <div
          className="fixed inset-0 z-[999] bg-black/70 backdrop-blur-md flex items-center justify-center p-3 md:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closePanelDetails();
            }
          }}
        >
          <div className="w-full max-w-6xl max-h-[92vh] overflow-hidden bg-[#07101f] border border-white/10 rounded-[2rem] md:rounded-[3rem] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 p-5 md:p-7 bg-[#07101f]/95 backdrop-blur-xl border-b border-white/5">
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 md:w-14 md:h-14 shrink-0 rounded-2xl ${selectedStatusConfig.soft} ${selectedStatusConfig.text} flex items-center justify-center border ${selectedStatusConfig.border}`}
                >
                  <Zap size={25} />
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl md:text-3xl text-white font-black">
                      {selectedFullPanel?.panel_name || 'Panel Details'}
                    </h2>

                    <span
                      className={`px-3 py-1 rounded-full text-[9px] uppercase tracking-wider font-black ${selectedStatusConfig.soft} ${selectedStatusConfig.text} border ${selectedStatusConfig.border}`}
                    >
                      {selectedStatusConfig.label}
                    </span>
                  </div>

                  <p className="text-yellow-500 text-xs font-black uppercase tracking-widest mt-2">
                    {selectedFullPanel?.panel_code || 'N/A'}
                  </p>
                </div>
              </div>

              <button
                onClick={closePanelDetails}
                className="w-10 h-10 shrink-0 rounded-xl bg-white/5 hover:bg-red-500 hover:text-white border border-white/10 flex items-center justify-center transition-all"
              >
                <X size={19} />
              </button>
            </div>

            <div className="max-h-[calc(92vh-110px)] overflow-y-auto p-5 md:p-7">
              {detailLoading ? (
                <div className="min-h-[350px] flex flex-col items-center justify-center gap-4">
                  <RefreshCw
                    size={30}
                    className="text-yellow-500 animate-spin"
                  />

                  <p className="text-slate-400 text-xs uppercase tracking-widest font-black">
                    Loading Complete Panel Specifications
                  </p>
                </div>
              ) : (
                <div className="space-y-7">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                      <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">
                        Current Status
                      </p>

                      <p className={`text-lg font-black mt-2 ${selectedStatusConfig.text}`}>
                        {selectedStatusConfig.label}
                      </p>
                    </div>

                    <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                      <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">
                        Today's Outages
                      </p>

                      <p className="text-lg text-white font-black mt-2">
                        {selectedStats?.today?.outage_count ?? 0}
                      </p>
                    </div>

                    <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                      <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">
                        Week Downtime
                      </p>

                      <p className="text-lg text-white font-black mt-2">
                        {formatDuration(
                          selectedStats?.week?.total_downtime_seconds
                        )}
                      </p>
                    </div>

                    <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                      <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">
                        Month Outages
                      </p>

                      <p className="text-lg text-white font-black mt-2">
                        {selectedStats?.month?.outage_count ?? 0}
                      </p>
                    </div>
                  </div>

                  <section>
                    <h3 className="flex items-center gap-2 text-sm text-white uppercase tracking-wider font-black mb-4">
                      <Factory size={17} className="text-yellow-500" />
                      General Information
                    </h3>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <DetailItem
                        label="Panel Code"
                        value={formatValue(selectedFullPanel?.panel_code)}
                        icon={Cpu}
                      />

                      <DetailItem
                        label="Panel Name"
                        value={formatValue(selectedFullPanel?.panel_name)}
                        icon={Activity}
                      />

                      <DetailItem
                        label="Panel Type"
                        value={formatValue(selectedFullPanel?.panel_type)}
                        icon={Network}
                      />

                      <DetailItem
                        label="Source Panel"
                        value={
                          selectedFullPanel?.source_panel_code
                            ? `${selectedFullPanel.source_panel_code} - ${
                                selectedFullPanel.source_panel_name || ''
                              }`
                            : 'Main / No Source'
                        }
                        icon={Route}
                      />

                      <DetailItem
                        label="Area"
                        value={formatValue(selectedFullPanel?.area)}
                        icon={Factory}
                      />

                      <DetailItem
                        label="Location"
                        value={formatValue(selectedFullPanel?.location)}
                        icon={MapPin}
                      />

                      <DetailItem
                        label="Status Reason"
                        value={formatValue(selectedFullPanel?.status_reason)}
                        icon={Info}
                      />

                      <DetailItem
                        label="Status Changed"
                        value={formatDateTime(
                          selectedFullPanel?.status_changed_at
                        )}
                        icon={Clock}
                      />
                    </div>
                  </section>

                  <section>
                    <h3 className="flex items-center gap-2 text-sm text-white uppercase tracking-wider font-black mb-4">
                      <Zap size={17} className="text-yellow-500" />
                      Electrical Specifications
                    </h3>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <DetailItem
                        label="Voltage"
                        value={formatValue(selectedFullPanel?.voltage, ' V')}
                        icon={Zap}
                      />

                      <DetailItem
                        label="Rated Current"
                        value={formatValue(
                          selectedFullPanel?.rated_current,
                          ' A'
                        )}
                        icon={Gauge}
                      />

                      <DetailItem
                        label="Frequency"
                        value={formatValue(
                          selectedFullPanel?.frequency,
                          ' Hz'
                        )}
                        icon={Activity}
                      />

                      <DetailItem
                        label="Phase"
                        value={formatValue(selectedFullPanel?.phase)}
                        icon={Network}
                      />

                      <DetailItem
                        label="Short Circuit Rating"
                        value={formatValue(
                          selectedFullPanel?.short_circuit_rating
                        )}
                        icon={ShieldCheck}
                      />

                      <DetailItem
                        label="Insulation Voltage"
                        value={formatValue(
                          selectedFullPanel?.insulation_voltage
                        )}
                        icon={ShieldCheck}
                      />

                      <DetailItem
                        label="Control Voltage"
                        value={formatValue(
                          selectedFullPanel?.control_voltage
                        )}
                        icon={Cpu}
                      />

                      <DetailItem
                        label="Earthing Details"
                        value={formatValue(
                          selectedFullPanel?.earthing_details
                        )}
                        icon={ShieldCheck}
                      />
                    </div>
                  </section>

                  <section>
                    <h3 className="flex items-center gap-2 text-sm text-white uppercase tracking-wider font-black mb-4">
                      <Power size={17} className="text-yellow-500" />
                      Incomer, Breaker & Busbar
                    </h3>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <DetailItem
                        label="Incomer Type"
                        value={formatValue(selectedFullPanel?.incomer_type)}
                        icon={Power}
                      />

                      <DetailItem
                        label="Incomer Rating"
                        value={formatValue(selectedFullPanel?.incomer_rating)}
                        icon={Gauge}
                      />

                      <DetailItem
                        label="Breaker Type"
                        value={formatValue(selectedFullPanel?.breaker_type)}
                        icon={Power}
                      />

                      <DetailItem
                        label="Breaker Rating"
                        value={formatValue(selectedFullPanel?.breaker_rating)}
                        icon={Gauge}
                      />

                      <DetailItem
                        label="Breaking Capacity"
                        value={formatValue(
                          selectedFullPanel?.breaking_capacity
                        )}
                        icon={ShieldCheck}
                      />

                      <DetailItem
                        label="Busbar Rating"
                        value={formatValue(selectedFullPanel?.busbar_rating)}
                        icon={Gauge}
                      />

                      <DetailItem
                        label="Busbar Material"
                        value={formatValue(selectedFullPanel?.busbar_material)}
                        icon={Cpu}
                      />
                    </div>
                  </section>

                  <section>
                    <h3 className="flex items-center gap-2 text-sm text-white uppercase tracking-wider font-black mb-4">
                      <Cable size={17} className="text-yellow-500" />
                      Incoming Cable
                    </h3>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <DetailItem
                        label="Cable Size"
                        value={formatValue(
                          selectedFullPanel?.incoming_cable_size
                        )}
                        icon={Cable}
                      />

                      <DetailItem
                        label="Cable Type"
                        value={formatValue(
                          selectedFullPanel?.incoming_cable_type
                        )}
                        icon={Cable}
                      />

                      <DetailItem
                        label="Cable Cores"
                        value={formatValue(
                          selectedFullPanel?.incoming_cable_cores
                        )}
                        icon={Cable}
                      />

                      <DetailItem
                        label="Cable Length"
                        value={formatValue(
                          selectedFullPanel?.incoming_cable_length,
                          ' m'
                        )}
                        icon={Route}
                      />
                    </div>
                  </section>

                  <section>
                    <h3 className="flex items-center gap-2 text-sm text-white uppercase tracking-wider font-black mb-4">
                      <Cpu size={17} className="text-yellow-500" />
                      Manufacturer & Equipment
                    </h3>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <DetailItem
                        label="Manufacturer"
                        value={formatValue(selectedFullPanel?.manufacturer)}
                        icon={Factory}
                      />

                      <DetailItem
                        label="Model"
                        value={formatValue(selectedFullPanel?.model)}
                        icon={Cpu}
                      />

                      <DetailItem
                        label="Serial Number"
                        value={formatValue(selectedFullPanel?.serial_number)}
                        icon={Info}
                      />

                      <DetailItem
                        label="IP Rating"
                        value={formatValue(selectedFullPanel?.ip_rating)}
                        icon={ShieldCheck}
                      />

                      <DetailItem
                        label="Installation Date"
                        value={formatDate(
                          selectedFullPanel?.installation_date
                        )}
                        icon={CalendarDays}
                      />

                      <DetailItem
                        label="Last Maintenance"
                        value={formatDate(
                          selectedFullPanel?.last_maintenance_date
                        )}
                        icon={Wrench}
                      />

                      <DetailItem
                        label="Next Maintenance"
                        value={formatDate(
                          selectedFullPanel?.next_maintenance_date
                        )}
                        icon={CalendarDays}
                      />
                    </div>
                  </section>

                  <section>
                    <h3 className="flex items-center gap-2 text-sm text-white uppercase tracking-wider font-black mb-4">
                      <Clock size={17} className="text-yellow-500" />
                      Downtime & Outage Statistics
                    </h3>

                    <div className="grid md:grid-cols-3 gap-3">
                      {[
                        ['Today', selectedStats?.today],
                        ['This Week', selectedStats?.week],
                        ['This Month', selectedStats?.month]
                      ].map(([label, stats]) => (
                        <div
                          key={label}
                          className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl"
                        >
                          <p className="text-[10px] uppercase tracking-widest text-yellow-500 font-black">
                            {label}
                          </p>

                          <div className="grid grid-cols-2 gap-3 mt-4">
                            <div>
                              <p className="text-[9px] text-slate-500 uppercase font-black">
                                Outages
                              </p>

                              <p className="text-2xl text-white font-black mt-1">
                                {stats?.outage_count ?? 0}
                              </p>
                            </div>

                            <div>
                              <p className="text-[9px] text-slate-500 uppercase font-black">
                                Downtime
                              </p>

                              <p className="text-lg text-white font-black mt-1">
                                {formatDuration(
                                  stats?.total_downtime_seconds
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="flex items-center gap-2 text-sm text-white uppercase tracking-wider font-black mb-4">
                      <Route size={17} className="text-yellow-500" />
                      Connected Cable Routes
                    </h3>

                    <div className="grid md:grid-cols-2 gap-3">
                      {[
                        ...(selectedPanelDetails?.incomingRoutes || []),
                        ...(selectedPanelDetails?.outgoingRoutes || [])
                      ].length > 0 ? (
                        [
                          ...(selectedPanelDetails?.incomingRoutes || []),
                          ...(selectedPanelDetails?.outgoingRoutes || [])
                        ].map((route, index) => (
                          <div
                            key={`${route.id}-${index}`}
                            className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-yellow-500 text-xs font-black">
                                  {route.route_code || `Route #${route.id}`}
                                </p>

                                <p className="text-white text-sm font-bold mt-1">
                                  {route.route_name || 'Cable Route'}
                                </p>
                              </div>

                              <Cable
                                size={20}
                                className="text-slate-500"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-4 text-[10px]">
                              <span className="text-slate-500">
                                Type:{' '}
                                <strong className="text-white">
                                  {route.route_type || 'N/A'}
                                </strong>
                              </span>

                              <span className="text-slate-500">
                                Size:{' '}
                                <strong className="text-white">
                                  {route.cable_size || 'N/A'}
                                </strong>
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="md:col-span-2 p-8 text-center bg-white/[0.02] border border-dashed border-white/10 rounded-2xl">
                          <Cable
                            size={28}
                            className="text-slate-700 mx-auto"
                          />

                          <p className="text-slate-500 text-xs font-bold mt-3">
                            No connected cable routes found.
                          </p>
                        </div>
                      )}
                    </div>
                  </section>

                  {(selectedFullPanel?.description ||
                    selectedFullPanel?.notes) && (
                    <section>
                      <h3 className="flex items-center gap-2 text-sm text-white uppercase tracking-wider font-black mb-4">
                        <Info size={17} className="text-yellow-500" />
                        Description & Notes
                      </h3>

                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl">
                          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">
                            Description
                          </p>

                          <p className="text-sm text-slate-300 leading-6 mt-3">
                            {selectedFullPanel?.description || 'N/A'}
                          </p>
                        </div>

                        <div className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl">
                          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">
                            Notes
                          </p>

                          <p className="text-sm text-slate-300 leading-6 mt-3">
                            {selectedFullPanel?.notes || 'N/A'}
                          </p>
                        </div>
                      </div>
                    </section>
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

function LayoutPanelIcon({ size = 20, className = '' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}