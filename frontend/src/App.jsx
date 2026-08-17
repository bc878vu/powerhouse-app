import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./Layout";
import Login from "./Login";
import Dashboard from "./Dashboard";
import UserDashboard from "./UserDashboard";
import AddUser from "./AddUser";
import StaffRecord from "./StaffRecord";
import UserDetails from "./UserDetails";
import StaffDutyManagement from "./pages/StaffDutyManagement";
import AssignTasks from "./AssignTasks";
import MyTasks from "./MyTasks";
import TaskView from "./TaskView";
import Profile from "./Profile";
import AssignTools from "./pages/AssignTools";
import AddPanel from "./pages/AddPanel";
import Panels from "./pages/Panels";
import PanelHistory from "./pages/PanelHistory";
import InteractivePanelMap from "./InteractivePanelMap";
import FuelManagement from "./pages/FuelManagement";
import { getToken, getUser } from "./utils/auth";

export default function App() {
  const isAuth = !!getToken();
  const user = getUser();
  const isAdmin = user?.role === "superadmin" || user?.role === "admin";
  const adminOnly = (element) => isAuth && isAdmin ? element : <Navigate to="/" replace />;
  const authOnly = (element) => isAuth ? element : <Navigate to="/" replace />;

  return (
    <Router>
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
    </Router>
  );
}
