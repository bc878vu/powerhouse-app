import React, { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, ExternalLink, RefreshCw, ShieldCheck, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { getUser } from "./utils/auth";
import { listUsers } from "./services/firebaseDataStore";
import { createNotification, enablePushNotifications, getCurrentNotificationUid, markAllNotificationsRead, markNotificationRead, sendPushNotification, subscribeToNotifications } from "./services/notificationService";

function isRecoverablePushError(error) { const text = String(error?.message || error || "").toLowerCase(); return text.includes("push service error") || text.includes("failed to subscribe") || text.includes("token-subscribe-failed"); }

export default function Notifications() {
  const user = getUser();
  const uid = getCurrentNotificationUid() || user?.firebaseUid || user?.uid;
  const isAdmin = ["admin", "superadmin"].includes(String(user?.role || "").toLowerCase());
  const [notifications, setNotifications] = useState([]);
  const [pushState, setPushState] = useState(typeof Notification !== "undefined" && Notification.permission === "granted" ? "enabled" : "idle");
  const [error, setError] = useState(""); const [users, setUsers] = useState([]); const [recipient, setRecipient] = useState("all"); const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [sending, setSending] = useState(false); const [sent, setSent] = useState("");
  useEffect(() => subscribeToNotifications(uid, setNotifications), [uid]);
  useEffect(() => { if (!isAdmin) return; listUsers().then((items) => setUsers(items.filter((item) => String(item.status || "active").toLowerCase() !== "inactive"))).catch(() => {}); }, [isAdmin]);
  const unreadCount = useMemo(() => notifications.filter((item) => !item.read).length, [notifications]);

  const enablePush = async () => {
    setError(""); setPushState("loading");
    try {
      const token = await enablePushNotifications();
      if (!token) throw new Error("Push permission was not granted or Firebase did not return a registration token.");
      setPushState("enabled");
    } catch (firstError) {
      if (isRecoverablePushError(firstError)) {
        try {
          const token = await enablePushNotifications({ requestPermission: false, forceFresh: true });
          if (token) { setPushState("enabled"); setError(""); return; }
        } catch (retryError) { console.error("FCM forced recovery retry failed:", retryError); firstError = retryError; }
      }
      setPushState("idle");
      setError(firstError?.message || "Unable to enable notifications.");
    }
  };
  const markRead = async (item) => { try { await markNotificationRead(uid, item.id); } catch (err) { setError(err?.message || "Unable to update notification."); } };
  const sendAdminNotification = async (event) => {
    event.preventDefault(); if (!title.trim() || !body.trim()) return setError("Title and message are required."); setError(""); setSent(""); setSending(true);
    try {
      const recipients = recipient === "all" ? users.map((item) => String(item.uid || item.id || "")).filter(Boolean) : [recipient]; if (!recipients.length) throw new Error("No active users are available.");
      const notificationId = `manual-${Date.now()}`;
      await Promise.all(recipients.map((targetUid) => createNotification(targetUid, { title: title.trim(), body: body.trim(), type: "admin_message", route: "/notifications", sourceId: notificationId })));
      const result = await sendPushNotification({ title: title.trim(), body: body.trim(), route: "/notifications", userIds: recipients, notificationId });
      setSent(`Notification saved for ${recipients.length} user${recipients.length === 1 ? "" : "s"}. Push sent: ${Number(result?.sent || 0)}.`); setTitle(""); setBody("");
    } catch (err) { setError(err?.message || "Unable to send notification."); } finally { setSending(false); }
  };
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-500">PowerHouse Alerts</p><h1 className="mt-2 text-3xl font-black">Notifications</h1><p className="mt-1 text-sm text-slate-400">Realtime Firebase alerts, admin messages and background push notifications.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => markAllNotificationsRead(uid, notifications)} className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-white/10"><CheckCheck size={17} /> Mark all read</button><button onClick={enablePush} disabled={pushState === "loading"} className="inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-4 py-3 text-sm font-black text-black hover:bg-yellow-400 disabled:opacity-60">{pushState === "loading" ? <RefreshCw size={17} className="animate-spin" /> : <Bell size={17} />}{pushState === "enabled" ? "Push Enabled" : "Enable Push"}</button></div></div>
      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}{sent && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{sent}</div>}
      {isAdmin && <form onSubmit={sendAdminNotification} className="rounded-2xl border border-yellow-500/20 bg-yellow-500/[0.04] p-5 space-y-4"><div className="flex items-center gap-2"><Send size={18} className="text-yellow-500" /><h2 className="font-black">Send Admin Notification</h2></div><div className="grid gap-3 md:grid-cols-3"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Notification title" className="rounded-xl border border-white/10 bg-[#020617] px-4 py-3 text-sm text-white outline-none focus:border-yellow-500" /><input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" className="rounded-xl border border-white/10 bg-[#020617] px-4 py-3 text-sm text-white outline-none focus:border-yellow-500" /><select value={recipient} onChange={(e) => setRecipient(e.target.value)} className="rounded-xl border border-white/10 bg-[#020617] px-4 py-3 text-sm text-white outline-none focus:border-yellow-500"><option value="all">All active users</option>{users.map((item) => <option key={String(item.uid || item.id)} value={String(item.uid || item.id)}>{item.name || item.email || item.uid || item.id}</option>)}</select></div><button disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-5 py-3 text-sm font-black text-black disabled:opacity-60"><Send size={16} />{sending ? "Sending…" : "Send Notification"}</button></form>}
      <div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5"><p className="text-xs uppercase tracking-widest text-slate-500">Total</p><p className="mt-2 text-3xl font-black">{notifications.length}</p></div><div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5"><p className="text-xs uppercase tracking-widest text-slate-500">Unread</p><p className="mt-2 text-3xl font-black text-yellow-500">{unreadCount}</p></div><div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5"><p className="text-xs uppercase tracking-widest text-slate-500">Delivery</p><p className="mt-2 flex items-center gap-2 text-sm font-bold text-emerald-400"><ShieldCheck size={18} /> Firebase + Web Push</p></div></div>
      <div className="overflow-hidden rounded-2xl border border-white/5 bg-[#0b1222]">{notifications.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center text-slate-500"><Bell size={34} /><p className="font-bold text-slate-300">No notifications yet</p><p className="text-sm">New task, duty and system alerts will appear here.</p></div> : notifications.map((item) => <div key={item.id} className={`flex gap-4 border-b border-white/5 p-5 last:border-b-0 ${item.read ? "opacity-70" : "bg-yellow-500/[0.03]"}`}><div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.read ? "bg-white/5 text-slate-400" : "bg-yellow-500/15 text-yellow-500"}`}><Bell size={18} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-black text-white">{item.title}</h2>{!item.read && <span className="rounded-full bg-yellow-500 px-2 py-1 text-[10px] font-black uppercase text-black">New</span>}</div><p className="mt-1 text-sm leading-6 text-slate-400">{item.body}</p><div className="mt-3 flex flex-wrap gap-3">{!item.read && <button onClick={() => markRead(item)} className="text-xs font-bold text-yellow-500 hover:text-yellow-300">Mark read</button>}{item.route && <Link onClick={() => markRead(item)} to={item.route} className="inline-flex items-center gap-1 text-xs font-bold text-slate-300 hover:text-white">Open <ExternalLink size={13} /></Link>}</div></div></div>)}</div>
    </section>
  );
}
