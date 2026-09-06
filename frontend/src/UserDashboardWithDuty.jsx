import React from "react";
import UserDashboard from "./UserDashboard";
import DashboardTaskResearch from "./components/DashboardTaskResearch";

export default function UserDashboardWithDuty() {
  return <><UserDashboard /><div className="px-4 pb-12 md:px-8"><div className="mx-auto max-w-[1650px]"><DashboardTaskResearch /></div></div></>;
}
