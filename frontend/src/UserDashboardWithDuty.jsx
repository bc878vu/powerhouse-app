import React from "react";
import UserDashboard from "./UserDashboard";
import MyDutyPanel from "./components/MyDutyPanel";

export default function UserDashboardWithDuty() {
  return <><UserDashboard /><div className="px-4 pb-10 md:px-8"><div className="mx-auto max-w-[1650px]"><MyDutyPanel /></div></div></>;
}
