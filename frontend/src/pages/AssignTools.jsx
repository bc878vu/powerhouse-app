import React, { useState, useEffect } from 'react';
import API from '../api';
import { Loader2, Wrench } from 'lucide-react';

export default function AssignTools() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // ✅ Form State specifically for Tools
  const [formData, setFormData] = useState({
    userId: '',
    userName: '',
    toolName: '',
    category: 'Electrical',
    quantity: 1,
    date: new Date().toISOString().split('T')[0] // Sets today's date
  });

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch staff for dropdown
  useEffect(() => {
    API.get('/user/all')
      .then(res => setStaff(res.data))
      .catch(() => showToast("Staff load failed", "error"));
  }, []);

  // Sync userName when userId is selected
  const handleStaffChange = (e) => {
    const id = e.target.value;
    const selected = staff.find(s => s.id == id);
    setFormData({ 
      ...formData, 
      userId: id, 
      userName: selected ? selected.name : '' 
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.userId || !formData.toolName) {
      return showToast("Fill Tool Name and select Staff", "error");
    }

    setLoading(true);
    try {
      // Send as JSON since no files are involved
      await API.post('/tools/assign', formData);
      
      showToast("Tool Assigned Successfully ✅");
      
      // Reset Form
      setFormData({
        userId: '',
        userName: '',
        toolName: '',
        category: 'Electrical',
        quantity: 1,
        date: new Date().toISOString().split('T')[0]
      });
    } catch (err) {
      showToast("Assignment failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center min-h-screen p-6">
      <div className="w-full max-w-2xl bg-slate-900 p-8 rounded-2xl space-y-6">
        
        <h2 className="text-white text-2xl font-bold flex items-center gap-2">
          <Wrench className="text-yellow-500" /> Assign Tool
        </h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* TOOL NAME */}
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Tool Name</label>
            <input 
              className="w-full p-3 bg-slate-800 text-white rounded outline-none border border-transparent focus:border-yellow-500"
              placeholder="e.g. Drill Machine, Multimeter"
              value={formData.toolName}
              onChange={e => setFormData({...formData, toolName: e.target.value})}
            />
          </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 gap-3">
            {/* CATEGORY */}
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Category</label>
              <select 
                className="w-full p-3 bg-slate-800 text-white rounded outline-none"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value})}
              >
                <option value="Electrical">Electrical</option>
                <option value="Mechanical">Mechanical</option>
                <option value="Safety">Safety</option>
                <option value="General">General</option>
              </select>
            </div>

            {/* QUANTITY */}
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Quantity</label>
              <input 
                type="number"
                min="1"
                className="w-full p-3 bg-slate-800 text-white rounded outline-none"
                value={formData.quantity}
                onChange={e => setFormData({...formData, quantity: e.target.value})}
              />
            </div>
          </div>

          {/* SELECT STAFF */}
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Assign To Staff</label>
            <select 
              className="w-full p-3 bg-slate-800 text-white rounded outline-none"
              value={formData.userId}
              onChange={handleStaffChange}
            >
              <option value="">Select Staff</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* DATE */}
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Date</label>
            <input 
              type="date"
              className="w-full p-3 bg-slate-800 text-white rounded outline-none"
              value={formData.date}
              onChange={e => setFormData({...formData, date: e.target.value})}
            />
          </div>

          <button className="w-full bg-yellow-500 py-3 rounded font-bold text-slate-900 mt-2">
            {loading ? <Loader2 className="animate-spin mx-auto"/> : "Assign Tool Now"}
          </button>

        </form>

        {/* TOAST */}
        {toast && (
          <div className={`fixed bottom-5 right-5 px-4 py-2 rounded shadow-lg text-white ${
            toast.type === "error" ? "bg-red-500" : "bg-green-600"
          }`}>
            {toast.msg}
          </div>
        )}

      </div>
    </div>
  );
}