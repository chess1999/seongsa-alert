import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import webpush from 'web-push';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'icn1';

const SLOTS = ['06:00~08:00','08:00~10:00','10:00~12:00','12:00~14:00','14:00~16:00','16:00~18:00','18:00~20:00','20:00~22:00'];
const FACILITIES = { '1':'대화','2':'삼송','3':'성라','4':'성사전천후','5':'성사실외','6':'중산','7':'충장','8':'킨텍스','9':'토당','10':'화정' };

const getKst = () => new Date(Date.now() + 9 * 3600000);
const inDnd = (d, k) => {
  if (!d?.enabled) return false;
  const t = k.toISOString().slice(11, 16);
  return d.start <= d.end ? (t >= d.start && t <= d.end) : (t >= d.start || t <= d.end);
};
const getSlots = (t, e) => ({ all:[0,1,2,3,4,5,6,7], morning:[0,1,2], afternoon:[3,4,5], evening:[6,7], exact:[Number(e)] }[t] || []);
const matchDate = (s, r) => {
  if (r.mode === 'date') return r.date === s;
  const [y, m, d] = s.split('-').map(Number);
  if (r.mode === 'monthly') return d === Number(r.dayOfMonth);
  if (r.mode === 'weekly') return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === Number(r.dayOfWeek);
  return false;
};

export async function GET() {
  const kst = getKst();
  await redis.set('last_heartbeat', { time: Date.now(), kst: kst.toISOString().replace('T', ' ').slice(0, 19) });
  const today = kst.toISOString().slice(0, 10);
  const dnd = (await redis.get('dnd')) || { enabled: true, start: '01:00', end: '05:30' };
  if (inDnd(dnd, kst)) return NextResponse.json({ status: 'skipped_dnd' });

  let rules = (await redis.get('rules')) || [];
  const valid = rules.filter((r) => r.mode !== 'date' || r.date >= today);
  if (valid.length !== rules.length) { await redis.set('rules', valid); rules = valid; }
  if (!rules.length) return NextResponse.json({ status: 'no_rules' });

  const targetSet = new Set();
  for (let i = 0; i <= 40; i++) {
    const ds = new Date(kst.getTime() + i * 86400000).toISOString().slice(0, 10);
    for (const r of rules) {
      if (matchDate(ds, r)) (r.facilities?.length ? r.facilities : ['4']).forEach((f) => targetSet.add(`${f}|${ds}`));
    }
  }

  const prev = new Set((await redis.get('prev_open_slots')) || []);
  const curr = new Set();
  const alerts = [];
  const errors = [];

  await Promise.all(Array.from(targetSet).map(async (key) => {
    const [fId, ds] = key.split('|');
    try {
      const res = await fetch(`https://www.gytennis.or.kr/daily/${fId}/${ds}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
        cache: 'no-store',
      });
      if (!res.ok) { errors.push(`${key}: HTTP ${res.status}`); return; }
      const html = await res.text();
      const fName = FACILITIES[fId] || `코트${fId}`;
      const $ = cheerio.load(html);
      const open = {};
      $('table.innerCustom').each((_, tbl) => {
        const c = $(tbl).find('.courtTag').text().replace(/[^0-9]/g, '');
        if (!c || (fId === '4' && !['9', '10', '11'].includes(c))) return;
        $(tbl).find('tr').slice(1).each((i, tr) => {
          if ($(tr).find('.public-empty-slot').length > 0) {
            (open[i] ||= []).push(c);
            curr.add(`${fId}|${ds}|${c}|${i}`);
          }
        });
      });

      for (const r of rules.filter((x) => matchDate(ds, x) && (x.facilities?.length ? x.facilities : ['4']).includes(fId))) {
        const allowed = getSlots(r.timeType, r.exactSlot);
        const url = `https://www.gytennis.or.kr/rsvDaily/${fId}/${ds}`;
        if (r.consecutiveOnly) {
          for (let i = 0; i < allowed.length - 1; i++) {
            const [s1, s2] = [allowed[i], allowed[i + 1]];
            if (s2 === s1 + 1 && open[s1]?.length && open[s2]?.length) {
              if (open[s1].some((c) => !prev.has(`${fId}|${ds}|${c}|${s1}`)) || open[s2].some((c) => !prev.has(`${fId}|${ds}|${c}|${s2}`))) {
                alerts.push({ title: `[연속 4시간] ${fName} ${ds}`, body: `${SLOTS[s1]}(${open[s1].join(',')}번) + ${SLOTS[s2]}(${open[s2].join(',')}번)`, url });
              }
            }
          }
        } else {
          const newly = allowed.filter((s) => open[s]).map((s) => {
            const nc = open[s].filter((c) => !prev.has(`${fId}|${ds}|${c}|${s}`));
            return nc.length ? `${SLOTS[s]}(${nc.join(',')}번)` : null;
          }).filter(Boolean);
          if (newly.length) alerts.push({ title: `[빈자리] ${fName} ${ds}`, body: newly.join(' / '), url });
        }
      }
    } catch (e) { errors.push(`${key}: ${e.message}`); }
  }));

  await redis.set('prev_open_slots', Array.from(curr));
  if (alerts.length) {
    webpush.setVapidDetails('mailto:seongsa.alert@gmail.com', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const subs = (await redis.get('subscriptions')) || [];
    const active = [];
    for (const sub of subs) {
      let ok = true;
      for (const a of alerts) {
        try { await webpush.sendNotification(sub, JSON.stringify(a)); }
        catch (e) { if (e.statusCode === 410 || e.statusCode === 404) ok = false; }
      }
      if (ok) active.push(sub);
    }
    if (active.length !== subs.length) await redis.set('subscriptions', active);
  }
  return NextResponse.json({ status: 'ok', targets: targetSet.size, openFound: curr.size, alerts: alerts.length, errors });
}
