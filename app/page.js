'use client';
import { useEffect, useState } from 'react';

const SLOTS = ['06:00~08:00','08:00~10:00','10:00~12:00','12:00~14:00','14:00~16:00','16:00~18:00','18:00~20:00','20:00~22:00'];
const DAYS = ['일','월','화','수','목','금','토'];
const FACS = [
  ['1','대화'],['2','삼송'],['3','성라'],['4','성사전천후'],['5','성사실외'],
  ['6','중산'],['7','충장'],['8','킨텍스'],['9','토당'],['10','화정']
];
const FAC_MAP = Object.fromEntries(FACS);

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function Home() {
  const [rules, setRules] = useState([]);
  const [dnd, setDnd] = useState({ enabled: true, start: '01:00', end: '05:30' });
  const [pushStatus, setPushStatus] = useState('미설정');
  const [mode, setMode] = useState('date');
  const [date, setDate] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState(15);
  const [dayOfWeek, setDayOfWeek] = useState(4);
  const [timeType, setTimeType] = useState('all');
  const [exactSlot, setExactSlot] = useState(2);
  const [consecutiveOnly, setConsecutiveOnly] = useState(false);
  const [facilities, setFacilities] = useState(['4']);

  useEffect(() => {
    fetch('/api/rules').then((r) => r.json()).then((d) => { setRules(d.rules || []); if (d.dnd) setDnd(d.dnd); });
    if ('Notification' in window && Notification.permission === 'granted') setPushStatus('알림 켜짐');
  }, []);

  const toggleFac = (id) => setFacilities((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return alert('아이폰은 사파리에서 [홈 화면에 추가] 후 실행해야 합니다.');
    if ((await Notification.requestPermission()) !== 'granted') return alert('알림 권한이 거부되었습니다.');
    const reg = await navigator.serviceWorker.register('/sw.js');
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) });
    await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
    setPushStatus('알림 켜짐'); alert('알림 설정이 완료되었습니다!');
  }

  async function addRule(e) {
    e.preventDefault();
    if (!facilities.length) return alert('테니스장을 1개 이상 선택해 주세요.');
    if (mode === 'date' && !date) return alert('날짜를 선택해 주세요.');
    const rule = { mode, date, dayOfMonth, dayOfWeek, timeType, exactSlot, consecutiveOnly, facilities };
    const res = await fetch('/api/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'rule', rule }) });
    setRules((await res.json()).rules);
  }

  async function deleteRule(id) {
    const res = await fetch('/api/rules', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setRules((await res.json()).rules);
  }

  async function saveDnd(nextDnd) {
    setDnd(nextDnd);
    await fetch('/api/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'dnd', dnd: nextDnd }) });
  }
  const card = { background: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' };

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <h2 style={{ margin: '8px 0 16px' }}>🎾 고양시 테니스장 빈자리 알림</h2>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>푸시 알림 상태: <b>{pushStatus}</b></span>
          <button onClick={enablePush} style={{ background: '#1d4ed8', color: '#fff', border: 0, padding: '8px 14px', borderRadius: 8 }}>알림 켜기</button>
        </div>
      </div>

      <form onSubmit={addRule} style={card}>
        <h3 style={{ marginTop: 0 }}>감시 조건 추가</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
          {FACS.map(([id, name]) => (
            <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, padding: '4px 6px', background: facilities.includes(id) ? '#eff6ff' : '#f9fafb', borderRadius: 6 }}>
              <input type="checkbox" checked={facilities.includes(id)} onChange={() => toggleFac(id)} />{name}
            </label>
          ))}
        </div>
        <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 10 }}>
          <option value="date">특정 날짜 지정</option><option value="weekly">매주 특정 요일</option><option value="monthly">매달 특정 일</option>
        </select>
        {mode === 'date' && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '95%', padding: 8, marginBottom: 10 }} />}
        {mode === 'weekly' && <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} style={{ width: '100%', padding: 8, marginBottom: 10 }}>{DAYS.map((d, i) => <option key={i} value={i}>매주 {d}요일</option>)}</select>}
        {mode === 'monthly' && <input type="number" min="1" max="31" value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} style={{ width: '95%', padding: 8, marginBottom: 10 }} />}
        <select value={timeType} onChange={(e) => setTimeType(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 10 }}>
          <option value="all">전체 시간 (06~22시)</option><option value="morning">오전 (06~12시)</option><option value="afternoon">오후 (12~18시)</option><option value="evening">저녁 (18~22시)</option><option value="exact">정확한 회차 지정</option>
        </select>
        {timeType === 'exact' && <select value={exactSlot} onChange={(e) => setExactSlot(Number(e.target.value))} style={{ width: '100%', padding: 8, marginBottom: 10 }}>{SLOTS.map((s, i) => <option key={i} value={i}>{s}</option>)}</select>}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input type="checkbox" checked={consecutiveOnly} onChange={(e) => setConsecutiveOnly(e.target.checked)} /><span>연속 2회차(4시간) 빈자리만 알림</span>
        </label>
        <button type="submit" style={{ width: '100%', background: '#111827', color: '#fff', border: 0, padding: 10, borderRadius: 8 }}>조건 등록하기</button>
      </form>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>등록된 감시 목록 ({rules.length})</h3>
        {!rules.length && <p style={{ color: '#6b7280' }}>등록된 조건이 없습니다.</p>}
        {rules.map((r) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eee' }}>
            <div>
              <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>{(r.facilities?.length ? r.facilities : ['4']).map((id) => FAC_MAP[id] || id).join(', ')}</div>
              <b>{r.mode === 'date' ? r.date : r.mode === 'weekly' ? `매주 ${DAYS[r.dayOfWeek]}요일` : `매달 ${r.dayOfMonth}일`}</b>
              <div style={{ fontSize: 13, color: '#4b5563' }}>
                {r.timeType === 'exact' ? SLOTS[r.exactSlot] : r.timeType === 'all' ? '전체' : r.timeType === 'morning' ? '오전' : r.timeType === 'afternoon' ? '오후' : '저녁'}{r.consecutiveOnly ? ' · [연속 4시간]' : ''}
              </div>
            </div>
            <button onClick={() => deleteRule(r.id)} style={{ background: '#ef4444', color: '#fff', border: 0, padding: '5px 10px', borderRadius: 6 }}>삭제</button>
          </div>
        ))}
      </div>

      <div style={card}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={dnd.enabled} onChange={(e) => saveDnd({ ...dnd, enabled: e.target.checked })} />
          <b>방해 금지 시간 ({dnd.start} ~ {dnd.end})</b>
        </label>
      </div>
    </main>
  );
}
