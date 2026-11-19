import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import webpush from 'web-push';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';
const SLOTS = ['06:00~08:00','08:00~10:00','10:00~12:00','12:00~14:00','14:00~16:00','16:00~18:00','18:00~20:00','20:00~22:00'];
const COURTS = ['9', '10', '11'];

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
  const today = kst.toISOString().slice(0, 10);
  const dnd = (await redis.get('dnd')) || { enabled: true, start: '01:00', end: '05:30' };
  if (inDnd(dnd, kst)) return NextResponse.json({ status: 'skipped_dnd', dates: [] });

  let rules = (await redis.get('rules')) || [];
  const valid = rules.filter((r) => r.mode !== 'date' || r.date >= today);
  if (valid.length !== rules.length) { await redis.set('rules', valid); rules = valid; }
  if (!rules.length) return NextResponse.json({ status: 'no_rules', dates: [] });

  const dates = [];
  for (let i = 0; i <= 40; i++) {
    const ds = new Date(kst.getTime() + i * 86400000).toISOString().slice(0, 10);
    if (rules.some((r) => matchDate(ds, r))) dates.push(ds);
  }
  return NextResponse.json({ status: 'ok', dates });
}

export async function POST(req) {
  const { pages } = await req.json();
  const rules = (await redis.get('rules')) || [];
  if (!pages || !rules.length) return NextResponse.json({ status: 'nothing_to_check' });

  const prev = new Set((await redis.get('prev_open_slots')) || []);
  const curr = new Set();
  const alerts = [];

  for (const [ds, html] of Object.entries(pages)) {
    const $ = cheerio.load(html);
    const open = {};
    $('table.innerCustom').each((_, tbl) => {
      const c = $(tbl).find('.courtTag').text().replace(/[^0-9]/g, '');
      if (!COURTS.includes(c)) return;
      $(tbl).find('tr').slice(1).each((i, tr) => {
        if ($(tr).find('.public-empty-slot').length > 0) {
          (open[i] ||= []).push(c);
          curr.add(`${ds}|${c}|${i}`);
        }
      });
    });

    for (const r of rules.filter((x) => matchDate(ds, x))) {
      const allowed = getSlots(r.timeType, r.exactSlot);
      if (r.consecutiveOnly) {
        for (let i = 0; i < allowed.length - 1; i++) {
          const [s1, s2] = [allowed[i], allowed[i + 1]];
          if (s2 === s1 + 1 && open[s1]?.length && open[s2]?.length) {
            if (open[s1].some((c) => !prev.has(`${ds}|${c}|${s1}`)) || open[s2].some((c) => !prev.has(`${ds}|${c}|${s2}`))) {
              alerts.push({ dateStr: ds, title: `[연속 4시간] 성사전천후 ${ds}`, body: `${SLOTS[s1]}(${open[s1].join(',')}번) + ${SLOTS[s2]}(${open[s2].join(',')}번)`, url: `https://www.gytennis.or.kr/rsvDaily/4/${ds}` });
            }
          }
        }
      } else {
        const newly = allowed.filter((s) => open[s]).map((s) => {
          const nc = open[s].filter((c) => !prev.has(`${ds}|${c}|${s}`));
          return nc.length ? `${SLOTS[s]}(${nc.join(',')}번)` : null;
        }).filter(Boolean);
        if (newly.length) alerts.push({ dateStr: ds, title: `[빈자리] 성사전천후 ${ds}`, body: newly.join(' / '), url: `https://www.gytennis.or.kr/rsvDaily/4/${ds}` });
      }
    }
  }

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
  return NextResponse.json({ status: 'ok', openFound: curr.size, alerts: alerts.length });
}
