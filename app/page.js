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

  const card = { background: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, boxShadow: '0 1px
