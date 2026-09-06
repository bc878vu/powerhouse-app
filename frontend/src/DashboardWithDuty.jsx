import React from "react";
import Dashboard from "./Dashboard";
import MyDutyPanel from "./components/MyDutyPanel";

export default function DashboardWithDuty() {
  return <><Dashboard /><div className="px-4 pb-10 md:px-8"><div className="mx-auto max-w-[1650px]"><MyDutyPanel compact /></div></div></>;
}
