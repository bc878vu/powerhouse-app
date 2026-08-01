import React, { useEffect, useState } from 'react';
import API from '../api';

export default function PublicDashboard() {
  const [data, setData] = useState({
    todayComplaints: [],
    pendingComplaints: [],
    all: []
  });

  const fetchData = () => {
    API.get('/activity/public-dashboard')
      .then(res => setData(res.data))
      .catch(err => console.log(err));
  };

  useEffect(() => {
    fetchData();

    // 🔥 REAL TIME (every 5 sec)
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 bg-black min-h-screen text-white">

      <h1 className="text-3xl font-bold mb-6 text-yellow-500">
        Live Complaints Dashboard
      </h1>

      {/* TODAY */}
      <div className="mb-10">
        <h2 className="text-xl mb-3">Today Complaints</h2>
        <div className="grid gap-3">
          {data.todayComplaints.map(item => (
            <div key={item.id} className="p-4 bg-slate-800 rounded">
              <p><strong>{item.title}</strong></p>
              <p>User: {item.userName}</p>
              <p>Status: {item.status}</p>
            </div>
          ))}
        </div>
      </div>

      {/* PENDING */}
      <div>
        <h2 className="text-xl mb-3">Pending Complaints</h2>
        <div className="grid gap-3">
          {data.pendingComplaints.map(item => (
            <div key={item.id} className="p-4 bg-red-900/40 rounded">
              <p><strong>{item.title}</strong></p>
              <p>User: {item.userName}</p>
              <p>Status: {item.status}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}