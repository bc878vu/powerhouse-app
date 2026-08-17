import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./Layout";
import Login from "./Login";
import { getToken, getUser } from "./utils/auth";

const Dashboard = lazy(() => import("./Dashboard"));
const UserDashboard = lazy(() => import("./UserDashboard"));
const AddUser = lazy(() => import("./AddUser"));
const StaffRecord = lazy(() => import("./StaffRecord"));
const UserDetails = lazy(() => import("./UserDetails"));
const StaffDutyManagement = lazy(() => import("./pages/StaffDutyManagement"));
const AssignTasks = lazy(() => import("./AssignTasks"));
const MyTasks = lazy(() => import("./MyTasks"));
const TaskView = lazy(() => import("./TaskView"));
const Profile = lazy(() => import("./Profile"));
const AssignTools = lazy(() => import("./pages/AssignTools"));
const AddPanel = lazy(() => import("./pages/AddPanel"));
const Panels = lazy(() => import("./pages/Panels"));
const PanelHistory = lazy(() => import("./pages/PanelHistory"));
const InteractivePanelMap = lazy(() => import("./InteractivePanelMap"));
const FuelManagement = lazy(() => import("./FuelManagement"));

function PageLoader() {
  return (
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-4">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm font-semibold text-slate-300 shadow-xl">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-yellow-500/30 border-t-yellow-500" />
        Loading PowerHouse module…
      </div>
    </div>
  );
}

export default function App() {
  const isAuth = !!getToken();
  const user = getUser();
  const isAdmin = user?.role === "superadmin" || user?.role === "admin";
  const adminOnly = (element) => (isAuth && isAdmin ? element : <Navigate to="/" replace />);
  const authOnly = (element) => (isAuth ? element : <Navigate to="/" replace />);

  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={isAuth ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/" element={<Layout />}>
            <Route index element={isAuth ? (isAdmin ? <Dashboard /> : <UserDashboard />) : <Dashboard />} />
            <Route path="add-staff" element={adminOnly(<AddUser />)} />
            <Route path="staff-records" element={adminOnly(<StaffRecord />)} />
            <Route path="user/:id" element={<UserDetails />} />
            <Route path="staff-duty" element={adminOnly(<StaffDutyManagement />)} />
            <Route path="assign-tasks" element={adminOnly(<AssignTasks />)} />
            <Route path="my-tasks" element={authOnly(<MyTasks />)} />
            <Route path="task-view/:id" element={<TaskView />} />
            <Route path="profile" element={authOnly(<Profile />)} />
            <Route path="assign-tools" element={adminOnly(<AssignTools />)} />
            <Route path="add-panel" element={adminOnly(<AddPanel />)} />
            <Route path="add-panel/:id" element={adminOnly(<AddPanel />)} />
            <Route path="panels" element={adminOnly(<Panels />)} />
            <Route path="panel-history" element={adminOnly(<PanelHistory />)} />
            <Route path="interactive-panel-map" element={authOnly(<InteractivePanelMap />)} />
            <Route path="fuel-management" element={adminOnly(<FuelManagement />)} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
