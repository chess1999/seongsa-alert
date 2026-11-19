import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import webpush from 'web-push';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const SLOTS = [
  '06:00~08:00', '08:00~10:00', '10:00~12:00', '12:00~14:00',
  '14:00~16:00', '16:00~18:00', '18:00~20:00', '20:00~22:00'
];
const TARGET_COURTS = ['9', '10', '11'];

function getKstNow() {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

function isInDnd(dnd, kst) {
  if (!dnd?.enabled) return false;
  const hhmm = kst.toISOString().slice(11, 16);
  if (dnd.start <= dnd.end) return hhmm >= dnd.start && hhmm <= dnd.end;
  return hhmm >= dnd.start || hhmm <= dnd.end;
}

function getAllowedSlotIndices(timeType, exactSlot) {
  if (timeType === 'all') return [0, 1, 2, 3, 4, 5, 6, 7];
  if (timeType === 'morning') return [0, 1, 2];
  if (timeType === 'afternoon') return [3, 4, 5];
  if (timeType === 'evening') return [6, 7];
  if (timeType === 'exact') return [Number(exactSlot)];
  return [];
}

function dateMatchesRule(dateStr, rule) {
  if (rule.mode === 'date') return rule.date === dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (rule.mode === 'monthly') return d === Number(rule.dayOfMonth);
  if (rule.mode === 'weekly') return dt.getUTCDay() === Number(rule.dayOfWeek);
  return false;
}

function getCandidateDates(kst, rules) {
  const dates = [];
  for (let i = 0; i <= 40; i++) {
    const d = new Date(kst.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    if (rules.some((r) => dateMatchesRule(dateStr, r))) {
      dates.push(dateStr);
    }
  }
  return dates;
}

// 회사 PC가 "오늘 어떤 날짜들 확인하면 돼?" 하고 물어보는 곳
export async function GET() {
  const kst = getKstNow();
  const todayStr = kst.toISOString().slice(0, 10);

  const dnd = (await redis.get('dnd')) || { enabled: true, start: '01:00', end: '05:30' };
  if (isInDnd(dnd, kst)) {
    return NextResponse.json({ status: 'skipped_dnd', dates: [] });
  }

  let rules = (await redis.get('rules')) || [];
  const validRules = rules.filter((r) => r.mode !== 'date' || r.date >= todayStr);
  if (validRules.length !== rules.length) {
    await redis.set('rules', validRules);
    rules = validRules;
  }
  if (rules.length === 0) return NextResponse.json({ status: 'no_rules', dates: [] });

  const candidateDates = getCandidateDates(kst, rules);
  return NextResponse.json({ status: 'ok', dates: candidateDates });
}

// 회사 PC가 긁어온 고양시 사이트 화면을 받아서 빈자리 체크 & 푸시 발송하는 곳
export async function POST(req) {
  const { pages } = await req.json();
  const rules = (await redis.get('rules')) || [];
  if (!pages || rules.length === 0) {
    return NextResponse.json({ status: 'nothing_to_check' });
  }

  const prevOpen = new Set((await redis.get('prev_open_slots')) || []);
  const currentOpen = new Set();
  const alertsToSend = [];

  for (const [dateStr, html] of Object.entries(pages)) {
    const $ = cheerio.load(html);
    const openBySlot = {};

    $('table.innerCustom').each((_, tbl) => {
      const courtNum = $(tbl).find('.courtTag').text().replace(/[^0-9]/g, '');
      if (!TARGET_COURTS.includes(courtNum)) return;

      $(tbl).find('tr').slice(1).each((slotIdx, tr) => {
        if ($(tr).find('.public-empty-slot').length > 0) {
          if (!openBySlot[slotIdx]) openBySlot[slotIdx] = [];
          openBySlot[slotIdx].push(courtNum);
          currentOpen.add(`${dateStr}|${courtNum}|${slotIdx}`);
        }
      });
    });

    const matchedRules = rules.filter((r) => dateMatchesRule(dateStr, r));
    for (const rule of matchedRules) {
      const allowed = getAllowedSlotIndices(rule.timeType, rule.exactSlot);

      if (rule.consecutiveOnly) {
        for (let i = 0; i < allowed.length - 1; i++) {
          const s1 = allowed[i];
          const s2 = allowed[i + 1];
          if (s2 === s1 + 1 && openBySlot[s1]?.length && openBySlot[s2]?.length) {
            const hasNew = openBySlot[s1].some((c) => !prevOpen.has(`${dateStr}|${c}|${s1}`)) ||
                           openBySlot[s2].some((c) => !prevOpen.has(`${dateStr}|${c}|${s2}`));
            if (hasNew) {
              alertsToSend.push({
                dateStr,
                title: `[연속 4시간] 성사전천후 ${dateStr}`,
                body: `${SLOTS[s1]}(${openBySlot[s1].join(',')}번) + ${SLOTS[s2]}(${openBySlot[s2].join(',')}번)`,
                url: `https://www.gytennis.or.kr/rsvDaily/4/${dateStr}`,
              });
            }
          }
        }
      } else {
        const newlyOpened = [];
        for (const s of allowed) {
          if (!openBySlot[s]) continue;
          const newCourts = openBySlot[s].filter((c) => !prevOpen.has(`${dateStr}|${c}|${s}`));
          if (newCourts.length > 0) {
            newlyOpened.push(`${SLOTS[s]}(${newCourts.join(',')}번)`);
          }
        }
        if (newlyOpened.length > 0) {
          alertsToSend.push({
            dateStr,
            title: `[빈자리] 성사전천후 ${dateStr}`,
            body: newlyOpened.join(' / '),
            url: `https://www.gytennis.or.kr/rsvDaily/4/${dateStr}`,
          });
        }
      }
    }
  }

  await redis.set('prev_open_slots', Array.from(currentOpen));

  if (alertsToSend.length > 0) {
    webpush.setVapidDetails(
      'mailto:admin@seongsa-alert.local',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    const subs = (await redis.get('subscriptions')) || [];
    const activeSubs = [];

    for (const sub of subs) {
      let ok = true;
      for (const alert of alertsToSend) {
        try {
          await webpush.sendNotification(sub, JSON.stringify(alert));
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) ok = false;
        }
      }
      if (ok) activeSubs.push(sub);
    }
    if (activeSubs.length !== subs.length) {
      await redis.set('subscriptions', activeSubs);
    }
  }

  return NextResponse.json({
    status: 'ok',
    openFound: currentOpen.size,
    alerts: alertsToSend.length,
  });
}
