import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Cable,
  CheckCircle2,
  CircuitBoard,
  Factory,
  Gauge,
  MapPin,
  Save,
  Settings,
  ShieldCheck,
  Wrench,
  Zap,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Undo2,
  Trash2,
  Move,
  Route,
  Link2
} from "lucide-react";
import factoryMap from "../assets/factory-map.svg";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const initialForm = {
  panel_code: "",
  panel_name: "",
  panel_type: "",
  description: "",
  area: "",
  location: "",
  x_position: 50,
  y_position: 50,
  marker_width: 3,
  marker_height: 3,
  source_panel_id: "",
  status: "live",
  status_reason: "",
  voltage: "",
  rated_current: "",
  frequency: "50 Hz",
  phase: "3 Phase",
  incomer_type: "",
  incomer_rating: "",
  breaker_type: "",
  breaker_rating: "",
  breaking_capacity: "",
  busbar_rating: "",
  busbar_material: "",
  incoming_cable_size: "",
  incoming_cable_type: "",
  incoming_cable_cores: "",
  incoming_cable_length: "",
  manufacturer: "",
  model: "",
  serial_number: "",
  ip_rating: "",
  installation_date: "",
  short_circuit_rating: "",
  insulation_voltage: "",
  control_voltage: "",
  earthing_details: "",
  last_maintenance_date: "",
  next_maintenance_date: "",
  notes: "",
  route_name: "",
  cable_tray_name: ""
};

export default function AddPanel() {
  const [form, setForm] = useState(initialForm);
  const [panels, setPanels] = useState([]);
  const [loadingPanels, setLoadingPanels] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const mapViewportRef = useRef(null);
  const mapContentRef = useRef(null);
  const mapImageRef = useRef(null);

  const [mapZoom, setMapZoom] = useState(1);
  const [mapMode, setMapMode] = useState("panel");
  const [routePoints, setRoutePoints] = useState([]);
  const [draggingPointIndex, setDraggingPointIndex] = useState(null);
  const [existingRoutes, setExistingRoutes] = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [selectedConnectedRoute, setSelectedConnectedRoute] = useState("");

  const fetchPanels = async () => {
    try {
      setLoadingPanels(true);
      const response = await fetch(`${API_URL}/panels`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to load panels");
      }

      setPanels(data.panels || []);
    } catch (error) {
      console.error("LOAD PANELS ERROR:", error);
      setMessage({
        type: "error",
        text: error.message || "Could not load existing panels."
      });
    } finally {
      setLoadingPanels(false);
    }
  };

  const fetchExistingRoutes = async () => {
    try {
      setLoadingRoutes(true);

      const response = await fetch(`${API_URL}/panels/routes/all`);
      const data = await response.json();

      if (!response.ok) {
        console.warn("ROUTES API NOT READY:", data.message);
        setExistingRoutes([]);
        return;
      }

      setExistingRoutes(data.routes || []);
    } catch (error) {
      console.warn("LOAD ROUTES ERROR:", error);
      setExistingRoutes([]);
    } finally {
      setLoadingRoutes(false);
    }
  };

  useEffect(() => {
    fetchPanels();
    fetchExistingRoutes();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value
    }));

    if (message.text) {
      setMessage({ type: "", text: "" });
    }
  };

  const clamp = (value, min, max) => {
    return Math.min(Math.max(value, min), max);
  };

  const zoomInMap = () => {
    setMapZoom((previous) => Math.min(previous + 0.2, 4));
  };

  const zoomOutMap = () => {
    setMapZoom((previous) => Math.max(previous - 0.2, 0.3));
  };

  const resetMapZoom = () => {
    setMapZoom(1);

    if (mapViewportRef.current) {
      mapViewportRef.current.scrollLeft = 0;
      mapViewportRef.current.scrollTop = 0;
    }
  };

  const fitMapToScreen = () => {
    const viewport = mapViewportRef.current;
    const image = mapImageRef.current;

    if (!viewport || !image) return;

    const naturalWidth = image.naturalWidth || image.clientWidth;
    const naturalHeight = image.naturalHeight || image.clientHeight;

    if (!naturalWidth || !naturalHeight) return;

    const availableWidth = viewport.clientWidth - 30;
    const availableHeight = viewport.clientHeight - 30;

    const scaleX = availableWidth / naturalWidth;
    const scaleY = availableHeight / naturalHeight;
    const nextZoom = Math.min(scaleX, scaleY, 1);

    setMapZoom(Math.max(nextZoom, 0.3));

    requestAnimationFrame(() => {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    });
  };

  const handleMapWheel = (event) => {
    if (!event.ctrlKey) return;

    event.preventDefault();

    if (event.deltaY < 0) {
      setMapZoom((previous) => Math.min(previous + 0.1, 4));
    } else {
      setMapZoom((previous) => Math.max(previous - 0.1, 0.3));
    }
  };

  const getMapCoordinates = (event) => {
    const mapContent = mapContentRef.current;

    if (!mapContent) return null;

    const rect = mapContent.getBoundingClientRect();

    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    return {
      x: Number(clamp(x, 0, 100).toFixed(4)),
      y: Number(clamp(y, 0, 100).toFixed(4))
    };
  };

  const handleMapClick = (event) => {
    if (draggingPointIndex !== null) return;

    const coordinates = getMapCoordinates(event);

    if (!coordinates) return;

    if (mapMode === "panel") {
      setForm((previous) => ({
        ...previous,
        x_position: coordinates.x,
        y_position: coordinates.y
      }));
      return;
    }

    if (mapMode === "route") {
      setRoutePoints((previous) => [
        ...previous,
        {
          x: coordinates.x,
          y: coordinates.y
        }
      ]);
    }
  };

  const startDraggingRoutePoint = (event, index) => {
    event.stopPropagation();
    event.preventDefault();
    setDraggingPointIndex(index);
  };

  const handleRoutePointMove = (event) => {
    if (draggingPointIndex === null) return;

    const coordinates = getMapCoordinates(event);

    if (!coordinates) return;

    setRoutePoints((previous) =>
      previous.map((point, index) =>
        index === draggingPointIndex
          ? {
              x: coordinates.x,
              y: coordinates.y
            }
          : point
      )
    );
  };

  const stopDraggingRoutePoint = () => {
    setDraggingPointIndex(null);
  };

  const undoLastRoutePoint = () => {
    setRoutePoints((previous) => previous.slice(0, -1));
  };

  const clearCableRoute = () => {
    setRoutePoints([]);
    setSelectedConnectedRoute("");
  };

  const deleteRoutePoint = (indexToDelete) => {
    setRoutePoints((previous) =>
      previous.filter((_, index) => index !== indexToDelete)
    );
  };

  const attachRouteToPanel = () => {
    const panelPoint = {
      x: Number(form.x_position),
      y: Number(form.y_position)
    };

    setRoutePoints((previous) => {
      if (previous.length === 0) return [panelPoint];

      const lastPoint = previous[previous.length - 1];

      if (
        Number(lastPoint.x) === panelPoint.x &&
        Number(lastPoint.y) === panelPoint.y
      ) {
        return previous;
      }

      return [...previous, panelPoint];
    });
  };

  const attachToExistingRoute = () => {
    if (!selectedConnectedRoute) {
      setMessage({
        type: "error",
        text: "Please select an existing cable route first."
      });
      return;
    }

    const selectedRoute = existingRoutes.find(
      (route) => Number(route.id) === Number(selectedConnectedRoute)
    );

    if (!selectedRoute) {
      setMessage({
        type: "error",
        text: "Selected cable route could not be found."
      });
      return;
    }

    let points = selectedRoute.route_points || selectedRoute.points || [];

    if (typeof points === "string") {
      try {
        points = JSON.parse(points);
      } catch {
        points = [];
      }
    }

    if (!Array.isArray(points) || points.length === 0) {
      setMessage({
        type: "error",
        text: "Selected cable route has no valid route points."
      });
      return;
    }

    const lastPoint = points[points.length - 1];

    setRoutePoints((previous) => [
      ...previous,
      {
        x: Number(lastPoint.x),
        y: Number(lastPoint.y)
      }
    ]);

    setMessage({
      type: "success",
      text: `Cable route attached to ${selectedRoute.route_name || "existing route"}.`
    });
  };

  const openMapFullscreen = async () => {
    const element = mapViewportRef.current;

    if (!element) return;

    try {
      if (!document.fullscreenElement) {
        await element.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("FULLSCREEN ERROR:", error);
    }
  };

  const getStatusColor = () => {
    if (form.status === "off") return "#ef4444";
    if (form.status === "maintenance") return "#eab308";
    return "#22c55e";
  };

  const routePolylinePoints = routePoints
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

  const resetForm = () => {
    setForm(initialForm);
    setRoutePoints([]);
    setSelectedConnectedRoute("");
    setMapMode("panel");
    setMapZoom(1);
    setDraggingPointIndex(null);
    setMessage({ type: "", text: "" });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.panel_code.trim()) {
      setMessage({
        type: "error",
        text: "Panel Code is required."
      });
      return;
    }

    if (!form.panel_name.trim()) {
      setMessage({
        type: "error",
        text: "Panel Name is required."
      });
      return;
    }

    try {
      setSaving(true);
      setMessage({ type: "", text: "" });

      const payload = {
        ...form,
        panel_code: form.panel_code.trim(),
        panel_name: form.panel_name.trim(),
        source_panel_id:
          form.source_panel_id === ""
            ? null
            : Number(form.source_panel_id),
        x_position: Number(form.x_position),
        y_position: Number(form.y_position),
        marker_width: Number(form.marker_width),
        marker_height: Number(form.marker_height),
        cable_route_points: routePoints,
        connected_route_id:
          selectedConnectedRoute === ""
            ? null
            : Number(selectedConnectedRoute)
      };

      const response = await fetch(`${API_URL}/panels`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to create panel");
      }

      setMessage({
        type: "success",
        text: `${data.panel?.panel_name || "Panel"} created successfully.`
      });

      setForm(initialForm);
      setRoutePoints([]);
      setSelectedConnectedRoute("");
      setMapMode("panel");

      await fetchPanels();
      await fetchExistingRoutes();

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    } catch (error) {
      console.error("CREATE PANEL ERROR:", error);

      setMessage({
        type: "error",
        text: error.message || "Failed to create panel."
      });
    } finally {
      setSaving(false);
    }
  };

  const statusOptions = [
    {
      value: "live",
      label: "LIVE",
      description: "Panel is energized and operational",
      dotClass: "bg-green-500",
      activeClass: "border-green-500 bg-green-500/10 text-green-400"
    },
    {
      value: "off",
      label: "OFF",
      description: "Panel is switched off or unavailable",
      dotClass: "bg-red-500",
      activeClass: "border-red-500 bg-red-500/10 text-red-400"
    },
    {
      value: "maintenance",
      label: "MAINTENANCE",
      description: "Maintenance work is currently active",
      dotClass: "bg-yellow-500",
      activeClass: "border-yellow-500 bg-yellow-500/10 text-yellow-400"
    }
  ];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 shrink-0 bg-yellow-500 rounded-2xl flex items-center justify-center text-black shadow-lg shadow-yellow-500/20">
            <CircuitBoard size={28} />
          </div>

          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
              Add Electrical Panel
            </h1>

            <p className="text-slate-500 text-sm mt-1">
              Add complete panel specifications, status, electrical hierarchy,
              map position and cable route.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={resetForm}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
          >
            <ArrowLeft size={17} />
            Reset
          </button>

          <button
            type="submit"
            form="add-panel-form"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-yellow-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Activity size={17} className="animate-spin" />
            ) : (
              <Save size={17} />
            )}

            {saving ? "Saving..." : "Save Panel"}
          </button>
        </div>
      </div>

      {message.text && (
        <div
          className={`flex items-start gap-3 p-4 rounded-2xl border ${
            message.type === "success"
              ? "bg-green-500/10 border-green-500/20 text-green-400"
              : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          )}

          <p className="text-sm font-bold">{message.text}</p>
        </div>
      )}

      <form
        id="add-panel-form"
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <Section
          icon={<CircuitBoard size={20} />}
          title="Basic Panel Information"
          subtitle="Panel identity, classification and location"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            <Input
              label="Panel Code"
              name="panel_code"
              value={form.panel_code}
              onChange={handleChange}
              placeholder="Example: DB-01"
              required
            />

            <Input
              label="Panel Name"
              name="panel_name"
              value={form.panel_name}
              onChange={handleChange}
              placeholder="Example: Production DB-01"
              required
            />

            <Select
              label="Panel Type"
              name="panel_type"
              value={form.panel_type}
              onChange={handleChange}
            >
              <option value="">Select Panel Type</option>
              <option value="Main LT Panel">Main LT Panel</option>
              <option value="MDB">MDB — Main Distribution Board</option>
              <option value="SMDB">SMDB — Sub Main Distribution Board</option>
              <option value="DB">DB — Distribution Board</option>
              <option value="MCC">MCC — Motor Control Centre</option>
              <option value="PCC">PCC — Power Control Centre</option>
              <option value="APFC">APFC Panel</option>
              <option value="ATS">ATS Panel</option>
              <option value="Other">Other</option>
            </Select>

            <Input
              label="Area"
              name="area"
              value={form.area}
              onChange={handleChange}
              placeholder="Example: Production Hall"
            />

            <Input
              label="Exact Location"
              name="location"
              value={form.location}
              onChange={handleChange}
              placeholder="Example: Ground Floor, Line 02"
            />

            <Select
              label="Source / Main Supply Panel"
              name="source_panel_id"
              value={form.source_panel_id}
              onChange={handleChange}
              disabled={loadingPanels}
            >
              <option value="">
                {loadingPanels
                  ? "Loading panels..."
                  : "No Source / Main Incoming Panel"}
              </option>

              {panels.map((panel) => (
                <option key={panel.id} value={panel.id}>
                  {panel.panel_code} — {panel.panel_name}
                </option>
              ))}
            </Select>
          </div>

          <TextArea
            label="Panel Description"
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Enter a complete description of this electrical panel..."
          />
        </Section>

        <Section
          icon={<Activity size={20} />}
          title="Current Operational Status"
          subtitle="Select the current real-world state of this panel"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {statusOptions.map((option) => {
              const active = form.status === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setForm((previous) => ({
                      ...previous,
                      status: option.value
                    }))
                  }
                  className={`text-left p-5 rounded-2xl border transition-all ${
                    active
                      ? option.activeClass
                      : "bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-3 h-3 rounded-full ${option.dotClass} ${
                        active ? "animate-pulse" : ""
                      }`}
                    />

                    <span className="text-sm font-black">{option.label}</span>
                  </div>

                  <p className="text-[11px] mt-2 opacity-60">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>

          <TextArea
            label="Status Reason / Remarks"
            name="status_reason"
            value={form.status_reason}
            onChange={handleChange}
            placeholder="Example: Normal operation, breaker tripped, scheduled maintenance..."
          />
        </Section>

        <Section
          icon={<Zap size={20} />}
          title="Electrical Specifications"
          subtitle="Voltage, current, frequency and phase details"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            <Input
              label="Voltage"
              name="voltage"
              value={form.voltage}
              onChange={handleChange}
              placeholder="Example: 400 V"
            />

            <Input
              label="Rated Current"
              name="rated_current"
              value={form.rated_current}
              onChange={handleChange}
              placeholder="Example: 1600 A"
            />

            <Input
              label="Frequency"
              name="frequency"
              value={form.frequency}
              onChange={handleChange}
              placeholder="Example: 50 Hz"
            />

            <Input
              label="Phase"
              name="phase"
              value={form.phase}
              onChange={handleChange}
              placeholder="Example: 3 Phase"
            />

            <Input
              label="Short Circuit Rating"
              name="short_circuit_rating"
              value={form.short_circuit_rating}
              onChange={handleChange}
              placeholder="Example: 50 kA"
            />

            <Input
              label="Insulation Voltage"
              name="insulation_voltage"
              value={form.insulation_voltage}
              onChange={handleChange}
              placeholder="Example: 690 V"
            />

            <Input
              label="Control Voltage"
              name="control_voltage"
              value={form.control_voltage}
              onChange={handleChange}
              placeholder="Example: 24 V DC"
            />
          </div>
        </Section>

        <Section
          icon={<ShieldCheck size={20} />}
          title="Incomer & Breaker Specifications"
          subtitle="Protection device and incoming supply details"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            <Input
              label="Incomer Type"
              name="incomer_type"
              value={form.incomer_type}
              onChange={handleChange}
              placeholder="Example: ACB"
            />

            <Input
              label="Incomer Rating"
              name="incomer_rating"
              value={form.incomer_rating}
              onChange={handleChange}
              placeholder="Example: 1600 A"
            />

            <Input
              label="Breaker Type"
              name="breaker_type"
              value={form.breaker_type}
              onChange={handleChange}
              placeholder="Example: MCCB / ACB"
            />

            <Input
              label="Breaker Rating"
              name="breaker_rating"
              value={form.breaker_rating}
              onChange={handleChange}
              placeholder="Example: 630 A"
            />

            <Input
              label="Breaking Capacity"
              name="breaking_capacity"
              value={form.breaking_capacity}
              onChange={handleChange}
              placeholder="Example: 50 kA"
            />
          </div>
        </Section>

        <Section
          icon={<Gauge size={20} />}
          title="Busbar Specifications"
          subtitle="Panel busbar capacity and construction"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Input
              label="Busbar Rating"
              name="busbar_rating"
              value={form.busbar_rating}
              onChange={handleChange}
              placeholder="Example: 2000 A"
            />

            <Input
              label="Busbar Material"
              name="busbar_material"
              value={form.busbar_material}
              onChange={handleChange}
              placeholder="Example: Copper"
            />
          </div>
        </Section>

        <Section
          icon={<Cable size={20} />}
          title="Incoming Cable Specifications"
          subtitle="Cable size, type, cores and length"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            <Input
              label="Cable Size"
              name="incoming_cable_size"
              value={form.incoming_cable_size}
              onChange={handleChange}
              placeholder="Example: 4C × 240 mm²"
            />

            <Input
              label="Cable Type"
              name="incoming_cable_type"
              value={form.incoming_cable_type}
              onChange={handleChange}
              placeholder="Example: XLPE/SWA/PVC"
            />

            <Input
              label="Number of Cores"
              name="incoming_cable_cores"
              value={form.incoming_cable_cores}
              onChange={handleChange}
              placeholder="Example: 4 Core"
            />

            <Input
              label="Cable Length"
              name="incoming_cable_length"
              value={form.incoming_cable_length}
              onChange={handleChange}
              placeholder="Example: 125 m"
            />
          </div>
        </Section>

        <Section
          icon={<Factory size={20} />}
          title="Manufacturer & Physical Details"
          subtitle="Equipment identity and enclosure details"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            <Input
              label="Manufacturer"
              name="manufacturer"
              value={form.manufacturer}
              onChange={handleChange}
              placeholder="Example: Schneider Electric"
            />

            <Input
              label="Model"
              name="model"
              value={form.model}
              onChange={handleChange}
              placeholder="Panel model"
            />

            <Input
              label="Serial Number"
              name="serial_number"
              value={form.serial_number}
              onChange={handleChange}
              placeholder="Serial number"
            />

            <Input
              label="IP Rating"
              name="ip_rating"
              value={form.ip_rating}
              onChange={handleChange}
              placeholder="Example: IP54"
            />

            <Input
              label="Installation Date"
              name="installation_date"
              type="date"
              value={form.installation_date}
              onChange={handleChange}
            />
          </div>
        </Section>

        <Section
          icon={<MapPin size={20} />}
          title="Map Position & Cable Route Designer"
          subtitle="Place panel on factory map, draw cable route, change direction and attach routes"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            <Input
              label="X Position (%)"
              name="x_position"
              type="number"
              step="0.0001"
              min="0"
              max="100"
              value={form.x_position}
              onChange={handleChange}
            />

            <Input
              label="Y Position (%)"
              name="y_position"
              type="number"
              step="0.0001"
              min="0"
              max="100"
              value={form.y_position}
              onChange={handleChange}
            />

            <Input
              label="Marker Width (%)"
              name="marker_width"
              type="number"
              step="0.1"
              min="0.1"
              value={form.marker_width}
              onChange={handleChange}
            />

            <Input
              label="Marker Height (%)"
              name="marker_height"
              type="number"
              step="0.1"
              min="0.1"
              value={form.marker_height}
              onChange={handleChange}
            />
          </div>

          <div className="bg-[#050a18] border border-white/10 rounded-2xl overflow-hidden">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 p-4 border-b border-white/10 bg-white/[0.02]">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMapMode("panel")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                    mapMode === "panel"
                      ? "bg-yellow-500 text-black"
                      : "bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  <MapPin size={16} />
                  Place Panel
                </button>

                <button
                  type="button"
                  onClick={() => setMapMode("route")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                    mapMode === "route"
                      ? "bg-yellow-500 text-black"
                      : "bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  <Route size={16} />
                  Draw Cable Route
                </button>

                <button
                  type="button"
                  onClick={attachRouteToPanel}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-black transition-all"
                >
                  <Cable size={16} />
                  Attach to Panel
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={zoomOutMap}
                  className="p-2.5 bg-white/5 hover:bg-yellow-500 hover:text-black rounded-xl transition-all"
                  title="Zoom Out"
                >
                  <ZoomOut size={17} />
                </button>

                <div className="min-w-[70px] text-center px-3 py-2.5 bg-white/5 rounded-xl text-xs font-black text-yellow-500">
                  {Math.round(mapZoom * 100)}%
                </div>

                <button
                  type="button"
                  onClick={zoomInMap}
                  className="p-2.5 bg-white/5 hover:bg-yellow-500 hover:text-black rounded-xl transition-all"
                  title="Zoom In"
                >
                  <ZoomIn size={17} />
                </button>

                <button
                  type="button"
                  onClick={resetMapZoom}
                  className="p-2.5 bg-white/5 hover:bg-yellow-500 hover:text-black rounded-xl transition-all"
                  title="Reset Zoom"
                >
                  <RotateCcw size={17} />
                </button>

                <button
                  type="button"
                  onClick={fitMapToScreen}
                  className="px-3 py-2.5 bg-white/5 hover:bg-yellow-500 hover:text-black rounded-xl text-xs font-black transition-all"
                >
                  Fit
                </button>

                <button
                  type="button"
                  onClick={openMapFullscreen}
                  className="p-2.5 bg-white/5 hover:bg-yellow-500 hover:text-black rounded-xl transition-all"
                  title="Fullscreen"
                >
                  <Maximize2 size={17} />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <span
                  className={`w-3 h-3 rounded-full ${
                    form.status === "live"
                      ? "bg-green-500"
                      : form.status === "off"
                      ? "bg-red-500"
                      : "bg-yellow-500"
                  }`}
                />

                <p className="text-xs text-slate-400">
                  Mode:
                  <span className="text-white font-black ml-2">
                    {mapMode === "panel"
                      ? "PANEL POSITION"
                      : "CABLE ROUTE DRAWING"}
                  </span>
                </p>
              </div>

              <p className="text-xs text-slate-500">
                Route Points:
                <span className="text-yellow-500 font-black ml-2">
                  {routePoints.length}
                </span>
              </p>
            </div>

            <div
              ref={mapViewportRef}
              onWheel={handleMapWheel}
              className="relative w-full h-[600px] overflow-auto bg-white"
            >
              <div
                ref={mapContentRef}
                onClick={handleMapClick}
                onMouseMove={handleRoutePointMove}
                onMouseUp={stopDraggingRoutePoint}
                onMouseLeave={stopDraggingRoutePoint}
                className={`relative origin-top-left ${
                  mapMode === "route" ? "cursor-crosshair" : "cursor-pointer"
                }`}
                style={{
                  width: `${mapZoom * 100}%`,
                  minWidth: `${mapZoom * 100}%`
                }}
              >
                <img
                  ref={mapImageRef}
                  src={factoryMap}
                  alt="PowerHouse Factory Map"
                  draggable="false"
                  onLoad={fitMapToScreen}
                  className="block w-full h-auto select-none pointer-events-none"
                />

                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  {routePoints.length > 1 && (
                    <polyline
                      points={routePolylinePoints}
                      fill="none"
                      stroke="#facc15"
                      strokeWidth="0.45"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      style={{
                        filter: "drop-shadow(0 0 4px rgba(250,204,21,0.8))"
                      }}
                    />
                  )}
                </svg>

                <div
                  className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${form.x_position}%`,
                    top: `${form.y_position}%`
                  }}
                >
                  <div
                    className="relative flex items-center justify-center rounded-lg border-2 border-white shadow-xl"
                    style={{
                      width: `${Math.max(Number(form.marker_width) * 8, 24)}px`,
                      height: `${Math.max(Number(form.marker_height) * 8, 24)}px`,
                      backgroundColor: getStatusColor(),
                      boxShadow: `0 0 20px ${getStatusColor()}`
                    }}
                  >
                    <CircuitBoard size={14} className="text-white" />

                    <span className="absolute top-full mt-1 whitespace-nowrap px-2 py-1 bg-black/90 text-white text-[9px] font-black rounded-md">
                      {form.panel_code || "NEW PANEL"}
                    </span>
                  </div>
                </div>

                {routePoints.map((point, index) => (
                  <div
                    key={`${point.x}-${point.y}-${index}`}
                    onMouseDown={(event) =>
                      startDraggingRoutePoint(event, index)
                    }
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      deleteRoutePoint(index);
                    }}
                    className="absolute z-30 w-5 h-5 -translate-x-1/2 -translate-y-1/2 bg-yellow-500 border-2 border-black rounded-full cursor-move shadow-lg flex items-center justify-center hover:scale-125 transition-transform"
                    style={{
                      left: `${point.x}%`,
                      top: `${point.y}%`
                    }}
                    title={`Route Point ${
                      index + 1
                    } — drag to change direction, double-click to delete`}
                  >
                    <span className="text-[8px] text-black font-black">
                      {index + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-4 border-t border-white/10">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={undoLastRoutePoint}
                  disabled={routePoints.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-xl text-xs font-black text-slate-300 transition-all"
                >
                  <Undo2 size={16} />
                  Undo Point
                </button>

                <button
                  type="button"
                  onClick={clearCableRoute}
                  disabled={routePoints.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-30 text-red-400 rounded-xl text-xs font-black transition-all"
                >
                  <Trash2 size={16} />
                  Clear Route
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Move size={15} className="text-yellow-500" />
                Drag yellow points to change cable direction. Double-click a
                point to delete it.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Input
              label="Cable Route Name"
              name="route_name"
              value={form.route_name}
              onChange={handleChange}
              placeholder="Example: Main LT to Production DB-01"
            />

            <Input
              label="Cable Tray Name / ID"
              name="cable_tray_name"
              value={form.cable_tray_name}
              onChange={handleChange}
              placeholder="Example: CT-01 / Main Production Tray"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <Select
              label="Attach / Join With Existing Cable Route"
              value={selectedConnectedRoute}
              onChange={(event) =>
                setSelectedConnectedRoute(event.target.value)
              }
              disabled={loadingRoutes}
            >
              <option value="">
                {loadingRoutes
                  ? "Loading existing routes..."
                  : "No Existing Route Selected"}
              </option>

              {existingRoutes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.route_name ||
                    route.cable_name ||
                    `Cable Route #${route.id}`}
                </option>
              ))}
            </Select>

            <button
              type="button"
              onClick={attachToExistingRoute}
              disabled={!selectedConnectedRoute}
              className="h-[50px] flex items-center justify-center gap-2 px-5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-30 disabled:cursor-not-allowed text-black rounded-xl text-xs font-black transition-all"
            >
              <Link2 size={16} />
              Attach Route
            </button>
          </div>

          <div className="p-4 bg-yellow-500/5 border border-yellow-500/10 rounded-2xl">
            <p className="text-xs text-yellow-500 font-bold leading-6">
              Place Panel mode mein map par click karke panel ki exact position
              set karein. Draw Cable Route mode mein multiple points click karke
              complete route banayein. Yellow points ko drag karke direction
              change karein, double-click karke point delete karein, aur Attach
              to Panel se route ka final point current panel ke saath connect
              karein.
            </p>
          </div>
        </Section>

        <Section
          icon={<Wrench size={20} />}
          title="Maintenance Information"
          subtitle="Last and upcoming scheduled maintenance"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Input
              label="Last Maintenance Date"
              name="last_maintenance_date"
              type="date"
              value={form.last_maintenance_date}
              onChange={handleChange}
            />

            <Input
              label="Next Maintenance Date"
              name="next_maintenance_date"
              type="date"
              value={form.next_maintenance_date}
              onChange={handleChange}
            />
          </div>
        </Section>

        <Section
          icon={<Settings size={20} />}
          title="Additional Technical Information"
          subtitle="Earthing, notes and any extra specifications"
        >
          <TextArea
            label="Earthing Details"
            name="earthing_details"
            value={form.earthing_details}
            onChange={handleChange}
            placeholder="Enter complete earthing details..."
          />

          <TextArea
            label="Additional Notes / Specifications"
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Enter any other panel specifications, remarks or technical information..."
            rows={6}
          />
        </Section>

        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={resetForm}
            disabled={saving}
            className="px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-slate-300 font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50"
          >
            Reset Form
          </button>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-3 px-8 py-4 bg-yellow-500 hover:bg-yellow-400 text-black rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-xl shadow-yellow-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Activity size={18} className="animate-spin" />
            ) : (
              <Save size={18} />
            )}

            {saving ? "Saving Panel..." : "Save Electrical Panel"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ icon, title, subtitle, children }) {
  return (
    <section className="bg-[#020617] border border-white/5 rounded-[2rem] overflow-hidden shadow-xl">
      <div className="flex items-center gap-4 px-5 md:px-7 py-5 border-b border-white/5 bg-white/[0.02]">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-yellow-500/10 border border-yellow-500/10 text-yellow-500 flex items-center justify-center">
          {icon}
        </div>

        <div>
          <h2 className="text-sm md:text-base text-white font-black tracking-wide">
            {title}
          </h2>

          <p className="text-[10px] md:text-xs text-slate-600 mt-1">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="p-5 md:p-7 space-y-5">{children}</div>
    </section>
  );
}

function Input({ label, required, ...props }) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-black">
        {label}

        {required && <span className="text-red-500 ml-1">*</span>}
      </span>

      <input
        {...props}
        required={required}
        className="w-full px-4 py-3.5 bg-white/[0.03] border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-700 outline-none transition-all focus:border-yellow-500/60 focus:ring-4 focus:ring-yellow-500/5 disabled:opacity-50"
      />
    </label>
  );
}

function Select({ label, children, ...props }) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-black">
        {label}
      </span>

      <select
        {...props}
        className="w-full px-4 py-3.5 bg-[#0a0f1e] border border-white/10 rounded-xl text-sm text-white outline-none transition-all focus:border-yellow-500/60 focus:ring-4 focus:ring-yellow-500/5 disabled:opacity-50"
      >
        {children}
      </select>
    </label>
  );
}

function TextArea({ label, rows = 4, ...props }) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-black">
        {label}
      </span>

      <textarea
        {...props}
        rows={rows}
        className="w-full px-4 py-3.5 bg-white/[0.03] border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-700 outline-none resize-y transition-all focus:border-yellow-500/60 focus:ring-4 focus:ring-yellow-500/5"
      />
    </label>
  );
}