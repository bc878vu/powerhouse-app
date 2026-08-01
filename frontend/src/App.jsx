import React from "react";

import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

/* =========================================================
   MAIN LAYOUT
========================================================= */

import Layout from "./Layout";

/* =========================================================
   AUTHENTICATION
========================================================= */

import Login from "./Login";

/* =========================================================
   DASHBOARDS
========================================================= */

import Dashboard from "./Dashboard";
import UserDashboard from "./UserDashboard";

/* =========================================================
   STAFF MANAGEMENT
========================================================= */

import AddUser from "./AddUser";
import StaffRecord from "./StaffRecord";
import UserDetails from "./UserDetails";

/* =========================================================
   STAFF DUTY MANAGEMENT
========================================================= */

import StaffDutyManagement from "./pages/StaffDutyManagement";

/* =========================================================
   TASK MANAGEMENT
========================================================= */

import AssignTasks from "./AssignTasks";
import MyTasks from "./MyTasks";
import TaskView from "./TaskView";

/* =========================================================
   USER PROFILE
========================================================= */

import Profile from "./Profile";

/* =========================================================
   TOOLS MANAGEMENT
========================================================= */

import AssignTools from "./pages/AssignTools";

/* =========================================================
   PUBLIC DASHBOARD
   KEPT — NOT REMOVED
========================================================= */

import PublicDashboard from "./pages/PublicDashboard";

/* =========================================================
   ELECTRICAL PANEL MANAGEMENT
========================================================= */

// Add + Edit Electrical Panel
import AddPanel from "./pages/AddPanel";

// Active Panel Management
import Panels from "./pages/Panels";

// Deleted / Archived Panel History
import PanelHistory from "./pages/PanelHistory";

/* =========================================================
   INTERACTIVE PANEL MAP
========================================================= */

import InteractivePanelMap from "./InteractivePanelMap";

/* =========================================================
   AUTH HELPERS
========================================================= */

import {
  getToken,
  getUser,
} from "./utils/auth";

/* =========================================================
   APP COMPONENT
========================================================= */

function App() {
  /* =======================================================
     AUTH STATE
  ======================================================= */

  const isAuth = !!getToken();

  const user = getUser();

  /* =======================================================
     ADMIN ACCESS CHECK
  ======================================================= */

  const isAdmin =
    user?.role === "superadmin" ||
    user?.role === "admin";

  /* =======================================================
     JSX
  ======================================================= */

  return (
    <Router>
      <Routes>

        {/* =================================================
            LOGIN PAGE

            If already logged in:
            Redirect to dashboard.

            If not logged in:
            Show login page.
        ================================================= */}

        <Route
          path="/login"
          element={
            isAuth ? (
              <Navigate
                to="/"
                replace
              />
            ) : (
              <Login />
            )
          }
        />

        {/* =================================================
            MAIN APPLICATION LAYOUT
        ================================================= */}

        <Route
          path="/"
          element={<Layout />}
        >

          {/* ===============================================
              MAIN DASHBOARD

              ADMIN / SUPERADMIN:
              Dashboard

              NORMAL USER:
              UserDashboard

              WITHOUT LOGIN:
              Public Dashboard view using Dashboard

              Existing behavior preserved.
          =============================================== */}

          <Route
            index
            element={
              isAuth ? (
                isAdmin ? (
                  <Dashboard />
                ) : (
                  <UserDashboard />
                )
              ) : (
                <Dashboard />
              )
            }
          />

          {/* ===============================================
              ADD STAFF

              ACCESS:
              Admin + Superadmin only
          =============================================== */}

          <Route
            path="add-staff"
            element={
              isAuth && isAdmin ? (
                <AddUser />
              ) : (
                <Navigate
                  to="/"
                  replace
                />
              )
            }
          />

          {/* ===============================================
              STAFF RECORDS

              ACCESS:
              Admin + Superadmin only
          =============================================== */}

          <Route
            path="staff-records"
            element={
              isAuth && isAdmin ? (
                <StaffRecord />
              ) : (
                <Navigate
                  to="/"
                  replace
                />
              )
            }
          />

          {/* ===============================================
              USER DETAILS / USER DASHBOARD

              URL:
              /user/:id

              EXAMPLES:
              /user/1
              /user/8
              /user/25

              ACCESS:
              PUBLIC

              IMPORTANT:
              This route is intentionally public so that:

              Main Dashboard
                    ↓
              Click User
                    ↓
              User Details
                    ↓
              Click Task
                    ↓
              Full Task Report

              No login required.
          =============================================== */}

          <Route
            path="user/:id"
            element={<UserDetails />}
          />

          {/* ===============================================
              STAFF DUTY MANAGEMENT

              URL:
              /staff-duty

              ACCESS:
              Admin + Superadmin only

              FEATURES:
              - Assign staff duty
              - Manage shifts
              - On Duty
              - Off Duty
              - Leave
              - Monthly leave counting
              - Duty history
              - Shift updates
          =============================================== */}

          <Route
            path="staff-duty"
            element={
              isAuth && isAdmin ? (
                <StaffDutyManagement />
              ) : (
                <Navigate
                  to="/"
                  replace
                />
              )
            }
          />

          {/* ===============================================
              ASSIGN TASKS

              ACCESS:
              Admin + Superadmin only
          =============================================== */}

          <Route
            path="assign-tasks"
            element={
              isAuth && isAdmin ? (
                <AssignTasks />
              ) : (
                <Navigate
                  to="/"
                  replace
                />
              )
            }
          />

          {/* ===============================================
              MY TASKS

              ACCESS:
              Any authenticated user
          =============================================== */}

          <Route
            path="my-tasks"
            element={
              isAuth ? (
                <MyTasks />
              ) : (
                <Navigate
                  to="/"
                  replace
                />
              )
            }
          />

          {/* ===============================================
              TASK REPORT / TASK VIEW

              URL:
              /task-view/:id

              EXAMPLES:
              /task-view/1
              /task-view/10
              /task-view/25

              ACCESS:
              PUBLIC

              IMPORTANT FIX:
              Previously this route required authentication.

              Because of that:

              Login → Task View
              worked correctly.

              But:

              Public Dashboard
                    ↓
              User Details
                    ↓
              Task View

              redirected back to "/" because isAuth was false.

              Now TaskView is directly accessible without
              login.
          =============================================== */}

          <Route
            path="task-view/:id"
            element={<TaskView />}
          />

          {/* ===============================================
              PROFILE

              ACCESS:
              Any authenticated user
          =============================================== */}

          <Route
            path="profile"
            element={
              isAuth ? (
                <Profile />
              ) : (
                <Navigate
                  to="/"
                  replace
                />
              )
            }
          />

          {/* ===============================================
              ASSIGN TOOLS

              ACCESS:
              Admin + Superadmin only
          =============================================== */}

          <Route
            path="assign-tools"
            element={
              isAuth && isAdmin ? (
                <AssignTools />
              ) : (
                <Navigate
                  to="/"
                  replace
                />
              )
            }
          />

          {/* ===============================================
              ADD NEW ELECTRICAL PANEL

              URL:
              /add-panel

              ACCESS:
              Admin + Superadmin only
          =============================================== */}

          <Route
            path="add-panel"
            element={
              isAuth && isAdmin ? (
                <AddPanel />
              ) : (
                <Navigate
                  to="/"
                  replace
                />
              )
            }
          />

          {/* ===============================================
              EDIT EXISTING ELECTRICAL PANEL

              URL:
              /add-panel/:id

              EXAMPLES:
              /add-panel/1
              /add-panel/25

              ACCESS:
              Admin + Superadmin only
          =============================================== */}

          <Route
            path="add-panel/:id"
            element={
              isAuth && isAdmin ? (
                <AddPanel />
              ) : (
                <Navigate
                  to="/"
                  replace
                />
              )
            }
          />

          {/* ===============================================
              ACTIVE PANEL MANAGEMENT

              URL:
              /panels

              ACCESS:
              Admin + Superadmin only

              FEATURES:
              - View
              - Edit
              - Change Status
              - Move to History
              - Print
          =============================================== */}

          <Route
            path="panels"
            element={
              isAuth && isAdmin ? (
                <Panels />
              ) : (
                <Navigate
                  to="/"
                  replace
                />
              )
            }
          />

          {/* ===============================================
              PANEL HISTORY

              URL:
              /panel-history

              ACCESS:
              Admin + Superadmin only

              FEATURES:
              - View deleted/archived panels
              - Complete old data preserved
              - Archived panels hidden from active list
              - Archived panels hidden from map
          =============================================== */}

          <Route
            path="panel-history"
            element={
              isAuth && isAdmin ? (
                <PanelHistory />
              ) : (
                <Navigate
                  to="/"
                  replace
                />
              )
            }
          />

          {/* ===============================================
              INTERACTIVE ELECTRICAL PANEL MAP

              URL:
              /interactive-panel-map

              ACCESS:
              Authenticated users only
          =============================================== */}

          <Route
            path="interactive-panel-map"
            element={
              isAuth ? (
                <InteractivePanelMap />
              ) : (
                <Navigate
                  to="/"
                  replace
                />
              )
            }
          />

        </Route>

        {/* =================================================
            FALLBACK ROUTE

            Any unknown URL redirects to dashboard.
        ================================================= */}

        <Route
          path="*"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />

      </Routes>
    </Router>
  );
}

/* =========================================================
   EXPORT
========================================================= */

export default App;