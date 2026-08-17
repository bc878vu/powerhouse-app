import React, { useEffect, useState } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import { isPublic } from "./utils/publicMode";
import { logout, getUser } from "./utils/auth";
import { getCurrentNotificationUid, subscribeToNotifications } from "./services/notificationService";
import {
  LayoutDashboard, UserPlus, ClipboardList, LogOut, Users, UserCircle,
  Menu, X, ChevronRight, Map, CircuitBoard, PanelsTopLeft,
  CalendarClock, Wrench, Fuel, Bell
} from "lucide-react";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const user = getUser();
  const publicMode = isPublic();

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  useEffect(() => {
    const uid = getCurrentNotificationUid() || user?.firebaseUid || user?.uid || user?.id;
    if (!uid) return undefined;
    return subscribeToNotifications(uid, (items) => {
      setUnreadCount(items.filter((item) => !item.read).length);
    });
  }, [user?.firebaseUid, user?.uid, user?.id]);

  const handleLogout = () => {
    logout();
    window.location.href = "/";
  };

  const menuItems = [
    { name: "Dashboard", icon: <LayoutDashboard size={20} />, path: "/", roles: ["superadmin", "admin", "electrician", "cro"] },
    { name: "My Tasks", icon: <ClipboardList size={20} />, path: "/my-tasks", roles: ["electrician", "cro"] },
    { name: "Add Staff", icon: <UserPlus size={20} />, path: "/add-staff", roles: ["superadmin", "admin"] },
    { name: "Staff Records", icon: <Users size={20} />, path: "/staff-records", roles: ["superadmin", "admin"] },
    { name: "Staff Duty", icon: <CalendarClock size={20} />, path: "/staff-duty", roles: ["superadmin", "admin"] },
    { name: "Assign Tasks", icon: <ClipboardList size={20} />, path: "/assign-tasks", roles: ["superadmin", "admin"] },
    { name: "Assign Tools", icon: <Wrench size={20} />, path: "/assign-tools", roles: ["superadmin", "admin"] },
    { name: "Add Panel", icon: <CircuitBoard size={20} />, path: "/add-panel", roles: ["superadmin", "admin"] },
    { name: "Panels", icon: <PanelsTopLeft size={20} />, path: "/panels", roles: ["superadmin", "admin"] },
    { name: "Interactive Panel Map", icon: <Map size={20} />, path: "/interactive-panel-map", roles: ["superadmin", "admin"] },
    { name: "Fuel Management", icon: <Fuel size={20} />, path: "/fuel-management", roles: ["superadmin", "admin"] },
    { name: "Profile", icon: <UserCircle size={20} />, path: "/profile", roles: ["superadmin", "admin", "electrician", "cro"] },
  ];

  const isActive = (path) => path === "/" ? location.pathname === "/" : location.pathname === path || location.pathname.startsWith(`${path}/`);

  if (publicMode) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-white">
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-[#020617]/90 backdrop-blur-xl border-b border-white/5">
          <h1 className="text-xl font-black tracking-tighter">POWER<span className="text-yellow-500">HOUSE LIVE</span></h1>
          <button onClick={() => navigate("/login")} className="bg-yellow-500 px-5 py-2 rounded-xl text-black font-bold">Login</button>
        </div>
        <main className="pt-24 px-4 md:px-10 pb-10"><div className="max-w-[1600px] mx-auto"><Outlet /></div></main>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#0a0f1e] text-white font-sans overflow-hidden">
      <header className="md:hidden fixed top-0 left-0 w-full z-[60] flex items-center justify-between px-6 py-4 bg-[#020617]/90 backdrop-blur-xl border-b border-white/5">
        <h1 className="text-xl font-black tracking-tighter italic">POWER<span className="text-yellow-500 not-italic">HOUSE</span></h1>
        <div className="flex items-center gap-2">
          <Link to="/notifications" aria-label="Notifications" className="relative rounded-xl p-2 text-slate-200 hover:bg-white/5">
            <Bell size={21} />
            {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[9px] font-black text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
          </Link>
          <button onClick={() => setSidebarOpen(true)} className="p-2 bg-yellow-500 rounded-xl text-black"><Menu size={20} /></button>
        </div>
      </header>

      {sidebarOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} fixed md:relative inset-y-0 left-0 z-[80] w-72 bg-[#020617] border-r border-white/5 flex flex-col p-6 shadow-2xl transition-transform duration-300`}>
        <div className="flex items-center justify-between mb-8 px-2">
          <div>
            <h1 className="text-2xl font-black italic">POWER<span className="text-yellow-500 not-italic">HOUSE</span></h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-[0.3em] font-black mt-1">Management Portal</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-2 text-slate-400"><X size={24} /></button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto pr-2 custom-scrollbar">
          {menuItems.filter(item => item.roles.includes(user?.role)).map(item => {
            const active = isActive(item.path);
            return (
              <Link key={item.path} to={item.path} className={`flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all ${active ? "bg-yellow-500 text-black font-bold shadow-xl shadow-yellow-500/10" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
                <div className="flex items-center gap-4"><span className={active ? "text-black" : "text-yellow-500"}>{item.icon}</span><span className="text-sm tracking-wide">{item.name}</span></div>
                {active && <ChevronRight size={14} className="opacity-50" />}
              </Link>
            );
          })}
          <Link to="/notifications" className={`flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all ${isActive("/notifications") ? "bg-yellow-500 text-black font-bold" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
            <div className="flex items-center gap-4"><span className={isActive("/notifications") ? "text-black" : "text-yellow-500"}><Bell size={20} /></span><span className="text-sm tracking-wide">Notifications</span></div>
            {unreadCount > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${isActive("/notifications") ? "bg-black text-yellow-500" : "bg-red-500 text-white"}`}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
          </Link>
        </nav>

        <div className="mt-auto pt-5 border-t border-white/5 space-y-3">
          <Link to="/profile" className="flex items-center gap-3 px-3 py-3 bg-white/[0.03] rounded-2xl border border-white/5 hover:bg-white/5">
            <div className="w-10 h-10 bg-yellow-500 rounded-2xl flex items-center justify-center text-black font-black shrink-0">{user?.name?.[0]?.toUpperCase() || "U"}</div>
            <div className="overflow-hidden"><p className="text-xs font-black truncate">{user?.name || "User"}</p><p className="text-[9px] uppercase tracking-tighter text-yellow-500 font-black mt-0.5">{user?.role || "user"}</p></div>
          </Link>
          <button onClick={handleLogout} className="flex items-center gap-4 px-6 py-4 w-full text-slate-500 hover:text-red-400 hover:bg-red-500/5 rounded-2xl font-bold text-xs uppercase tracking-widest"><LogOut size={18} /> Logout</button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        <main className="flex-1 overflow-y-auto px-4 md:px-10 pt-24 md:pt-10 pb-10 scroll-smooth">
          <div className="max-w-[1600px] mx-auto min-h-[calc(100vh-160px)]"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}
