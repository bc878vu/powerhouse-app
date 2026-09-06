import React, { useEffect } from "react";
import UserDashboard from "./UserDashboard";
import DashboardTaskResearch from "./components/DashboardTaskResearch";

export default function UserDashboardWithDuty() {
  useEffect(() => {
    const hideLegacyTaskRegister = () => {
      document.querySelectorAll("section").forEach((section) => {
        const heading = section.querySelector("h2");
        const title = String(heading?.textContent || "")
          .trim()
          .replace(/\s+/g, " ")
          .toUpperCase();

        if (title === "ALL ASSIGNED TASKS") {
          section.classList.add("dashboard-legacy-task-register");
        }
      });
    };

    hideLegacyTaskRegister();
    const observer = new MutationObserver(hideLegacyTaskRegister);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style>{`
        /* The research register is the single dashboard task list. */
        section.dashboard-legacy-task-register {
          display: none !important;
        }
      `}</style>
      <UserDashboard />
      <div className="px-4 pb-12 md:px-8">
        <div className="mx-auto max-w-[1650px]">
          <DashboardTaskResearch />
        </div>
      </div>
    </>
  );
}
