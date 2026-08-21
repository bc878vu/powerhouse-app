import React, { useEffect, useState } from 'react';
import API from '../api';
import { Loader2, Wrench } from 'lucide-react';

const today = () => new Date().toISOString().split('T')[0];

const emptyForm = () => ({
  userId: '',
  userName: '',
  toolName: '',
  category: 'Electrical',
  quantity: 1,
  date: today()
});

export default function AssignTools() {
  const [staff, setStaff] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    let mounted = true;

    const loadStaff = async () => {
      setLoadingStaff(true);
      try {
        const response = await API.get('/user/all');
        // Firebase migration returns the array directly, while older API
        // versions may wrap it in { users: [...] } or { data: [...] }.
        const users = Array.isArray(response)
          ? response
          : Array.isArray(response?.users)
            ? response.users
            : Array.isArray(response?.data)
              ? response.data
              : [];
        if (mounted) setStaff(users);
      } catch (error) {
        console.error('AssignTools: staff load failed', error);
        if (mounted) {
          setStaff([]);
          showToast(error?.message || 'Staff load failed', 'error');
        }
      } finally {
        if (mounted) setLoadingStaff(false);
      }
    };

    loadStaff();
    return () => { mounted = false; };
  }, []);

  const handleStaffChange = (e) => {
    const id = e.target.value;
    const selected = Array.isArray(staff)
      ? staff.find((s) => String(s?.id ?? s?.uid ?? '') === String(id))
      : null;

    setFormData((current) => ({
      ...current,
      userId: id,
      userName: selected?.name || selected?.fullName || selected?.email || ''
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const toolName = String(formData.toolName || '').trim();
    if (!formData.userId || !toolName) {
      showToast('Fill Tool Name and select Staff', 'error');
      return;
    }

    setLoading(true);
    try {
      await API.post('/tools/assign', {
        ...formData,
        toolName,
        quantity: Math.max(1, Number(formData.quantity) || 1)
      });

      showToast('Tool Assigned Successfully ✅');
      setFormData(emptyForm());
    } catch (error) {
      console.error('AssignTools: assignment failed', error);
      showToast(error?.message || 'Assignment failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const staffList = Array.isArray(staff) ? staff : [];

  return (
    <div className="flex justify-center min-h-screen p-6">
      <div className="w-full max-w-2xl bg-slate-900 p-8 rounded-2xl space-y-6">
        <h2 className="text-white text-2xl font-bold flex items-center gap-2">
          <Wrench className="text-yellow-500" /> Assign Tool
        </h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Tool Name</label>
            <input
              className="w-full p-3 bg-slate-800 text-white rounded outline-none border border-transparent focus:border-yellow-500"
              placeholder="e.g. Drill Machine, Multimeter"
              value={formData.toolName}
              onChange={(e) => setFormData((current) => ({ ...current, toolName: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Category</label>
              <select
                className="w-full p-3 bg-slate-800 text-white rounded outline-none"
                value={formData.category}
                onChange={(e) => setFormData((current) => ({ ...current, category: e.target.value }))}
              >
                <option value="Electrical">Electrical</option>
                <option value="Mechanical">Mechanical</option>
                <option value="Safety">Safety</option>
                <option value="General">General</option>
              </select>
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-1 block">Quantity</label>
              <input
                type="number"
                min="1"
                className="w-full p-3 bg-slate-800 text-white rounded outline-none"
                value={formData.quantity}
                onChange={(e) => setFormData((current) => ({ ...current, quantity: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-1 block">Assign To Staff</label>
            <select
              className="w-full p-3 bg-slate-800 text-white rounded outline-none"
              value={formData.userId}
              onChange={handleStaffChange}
              disabled={loadingStaff}
            >
              <option value="">{loadingStaff ? 'Loading Staff...' : 'Select Staff'}</option>
              {staffList.map((s) => {
                const id = s?.id ?? s?.uid ?? '';
                const name = s?.name || s?.fullName || s?.email || `Staff ${id}`;
                return <option key={String(id)} value={String(id)}>{name}</option>;
              })}
            </select>
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-1 block">Date</label>
            <input
              type="date"
              className="w-full p-3 bg-slate-800 text-white rounded outline-none"
              value={formData.date}
              onChange={(e) => setFormData((current) => ({ ...current, date: e.target.value }))}
            />
          </div>

          <button
            type="submit"
            disabled={loading || loadingStaff}
            className="w-full bg-yellow-500 py-3 rounded font-bold text-slate-900 mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Assign Tool Now'}
          </button>
        </form>

        {toast && (
          <div className={`fixed bottom-5 right-5 px-4 py-2 rounded shadow-lg text-white ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-600'}`}>
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}
