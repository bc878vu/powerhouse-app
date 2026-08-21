import React, { useCallback, useEffect, useMemo, useState } from 'react';
import API from '../api';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Loader2,
  RefreshCw,
  Search,
  UserRound,
  Users,
  Wrench,
  X
} from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({
  userId: '',
  userName: '',
  toolName: '',
  category: 'Electrical',
  quantity: 1,
  date: today()
});

function unwrapData(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.users)) return response.users;
  if (Array.isArray(response?.data?.users)) return response.data.users;
  if (Array.isArray(response?.result)) return response.result;
  return [];
}

function normalizeStaff(item, index) {
  const id = item?.id ?? item?.uid ?? item?.user_id ?? item?.userId ?? `staff-${index}`;
  const name = String(item?.name || item?.fullName || item?.full_name || item?.username || item?.email || `Staff ${index + 1}`).trim();
  return {
    ...item,
    id: String(id),
    name,
    email: item?.email || '',
    department: item?.department || item?.designation || 'Power House'
  };
}

export default function AssignTools() {
  const [staff, setStaff] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const loadStaff = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoadingStaff(true);

    try {
      const response = await API.get('/user/all');
      const users = unwrapData(response)
        .map(normalizeStaff)
        .filter((user) => user.id && !String(user.status || '').toLowerCase().includes('inactive'));
      setStaff(users);
    } catch (error) {
      console.error('AssignTools: staff load failed', error);
      setStaff([]);
      showToast(error?.message || 'Unable to load staff', 'error');
    } finally {
      setLoadingStaff(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((user) =>
      [user.name, user.email, user.department].some((value) => String(value || '').toLowerCase().includes(q))
    );
  }, [staff, search]);

  const selectedStaff = useMemo(
    () => staff.find((user) => String(user.id) === String(formData.userId)) || null,
    [staff, formData.userId]
  );

  const setField = (key, value) => {
    setFormData((current) => ({ ...current, [key]: value }));
  };

  const handleStaffChange = (event) => {
    const id = event.target.value;
    const selected = staff.find((user) => String(user.id) === String(id));
    setFormData((current) => ({
      ...current,
      userId: id,
      userName: selected?.name || ''
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const toolName = String(formData.toolName || '').trim();
    const quantity = Math.max(1, Number(formData.quantity) || 1);

    if (!toolName) {
      showToast('Please enter the tool name.', 'error');
      return;
    }
    if (!formData.userId) {
      showToast('Please select a staff member.', 'error');
      return;
    }

    setLoading(true);
    try {
      await API.post('/tools/assign', {
        ...formData,
        userId: String(formData.userId),
        user_id: String(formData.userId),
        userName: selectedStaff?.name || formData.userName || '',
        toolName,
        quantity,
        date: formData.date || today()
      });

      showToast(`“${toolName}” assigned to ${selectedStaff?.name || 'staff'} successfully.`);
      setFormData(emptyForm());
    } catch (error) {
      console.error('AssignTools: assignment failed', error);
      showToast(error?.message || 'Tool assignment failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(emptyForm());
    setSearch('');
  };

  return (
    <div className="min-h-screen w-full px-3 py-4 sm:px-5 lg:px-8 text-white">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/20">
                <Wrench size={23} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-yellow-400">Inventory Control</p>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Assign Tool</h1>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-400">Issue equipment to a staff member and keep the assignment record organized.</p>
          </div>

          <button
            type="button"
            onClick={() => loadStaff(true)}
            disabled={refreshing || loadingStaff}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-200 transition hover:border-yellow-500/50 hover:text-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh Staff
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.4fr_.8fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-extrabold">Tool Assignment</h2>
                <p className="mt-1 text-xs text-slate-500">Complete all required fields before assigning.</p>
              </div>
              <div className="rounded-xl bg-slate-900 px-3 py-2 text-center">
                <Users size={16} className="mx-auto text-yellow-400" />
                <span className="mt-1 block text-xs font-bold text-slate-300">{staff.length} Staff</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">Tool Name *</label>
                <div className="relative">
                  <Wrench size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 py-3 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/10"
                    placeholder="e.g. Drill Machine, Multimeter"
                    value={formData.toolName}
                    onChange={(event) => setField('toolName', event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">Category</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 pr-9 text-sm text-white outline-none focus:border-yellow-500"
                      value={formData.category}
                      onChange={(event) => setField('category', event.target.value)}
                    >
                      <option>Electrical</option>
                      <option>Mechanical</option>
                      <option>Safety</option>
                      <option>General</option>
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-yellow-500"
                    value={formData.quantity}
                    onChange={(event) => setField('quantity', event.target.value)}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Assign To Staff *</label>
                  <span className="text-[11px] text-slate-600">{filteredStaff.length} available</span>
                </div>
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3">
                  <Search size={16} className="text-slate-500" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="w-full bg-transparent py-2.5 text-xs text-white outline-none placeholder:text-slate-600"
                    placeholder="Search staff by name or department..."
                  />
                  {search && <button type="button" onClick={() => setSearch('')} className="text-slate-500 hover:text-white"><X size={15} /></button>}
                </div>
                <div className="relative">
                  <select
                    required
                    className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 pr-9 text-sm text-white outline-none focus:border-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
                    value={formData.userId}
                    onChange={handleStaffChange}
                    disabled={loadingStaff || !filteredStaff.length}
                  >
                    <option value="">{loadingStaff ? 'Loading staff...' : filteredStaff.length ? 'Select Staff Member' : 'No staff found'}</option>
                    {filteredStaff.map((user) => (
                      <option key={user.id} value={user.id}>{user.name}{user.department ? ` — ${user.department}` : ''}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                </div>
              </div>

              {selectedStaff && (
                <div className="flex items-center gap-3 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-500/15 text-yellow-400">
                    <UserRound size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{selectedStaff.name}</p>
                    <p className="truncate text-xs text-slate-500">{selectedStaff.department}{selectedStaff.email ? ` • ${selectedStaff.email}` : ''}</p>
                  </div>
                  <CheckCircle2 size={18} className="ml-auto shrink-0 text-emerald-400" />
                </div>
              )}

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">Assignment Date</label>
                <div className="relative">
                  <CalendarDays size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="date"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-yellow-500"
                    value={formData.date}
                    onChange={(event) => setField('date', event.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-bold text-slate-300 transition hover:border-slate-600 hover:text-white disabled:opacity-50 sm:w-auto"
                >
                  Clear
                </button>
                <button
                  type="submit"
                  disabled={loading || loadingStaff || !staff.length}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-yellow-500 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-yellow-500/10 transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? <Loader2 size={19} className="animate-spin" /> : <CheckCircle2 size={19} />}
                  {loading ? 'Assigning...' : 'Assign Tool Now'}
                </button>
              </div>
            </form>
          </section>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5 shadow-xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400"><Users size={19} /></div>
                <div><h3 className="font-extrabold">Staff Directory</h3><p className="text-xs text-slate-500">Ready for assignment</p></div>
              </div>
              <div className="rounded-2xl bg-slate-900 p-4">
                <p className="text-3xl font-black text-white">{staff.length}</p>
                <p className="mt-1 text-xs text-slate-500">Active staff members loaded</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5 shadow-xl">
              <h3 className="mb-3 font-extrabold">Assignment Checklist</h3>
              <div className="space-y-3 text-xs text-slate-400">
                {[
                  ['Tool name', !!String(formData.toolName).trim()],
                  ['Staff member', !!formData.userId],
                  ['Category', !!formData.category],
                  ['Quantity', Number(formData.quantity) >= 1],
                  ['Date', !!formData.date]
                ].map(([label, done]) => (
                  <div key={label} className="flex items-center gap-2">
                    <CheckCircle2 size={15} className={done ? 'text-emerald-400' : 'text-slate-700'} />
                    <span className={done ? 'text-slate-200' : ''}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur sm:left-auto sm:right-5 ${toast.type === 'error' ? 'border-red-500/30 bg-red-950/95 text-red-200' : 'border-emerald-500/30 bg-emerald-950/95 text-emerald-200'}`}>
          <CheckCircle2 size={18} className={toast.type === 'error' ? 'text-red-400' : 'text-emerald-400'} />
          <span className="flex-1">{toast.message}</span>
          <button type="button" onClick={() => setToast(null)}><X size={16} /></button>
        </div>
      )}
    </div>
  );
}
