import React from "react";
import ProfileStable from "./ProfileStable";
import MyDutyPanel from "./components/MyDutyPanel";

export default function ProfileWithDuty() {
  return <><ProfileStable /><div className="px-4 pb-10 md:px-8"><div className="mx-auto max-w-[1650px]"><MyDutyPanel compact={false} /></div></div></>;
}
