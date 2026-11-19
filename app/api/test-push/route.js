import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const subs = (await redis.get('subscriptions')) || [];
  if (subs.length === 0) {
    return NextResponse.json({
      ok: false,
      subsCount: 0,
      message: '등록된 아이폰이 0대입니다. 아이폰 홈 화면 앱에서 [알림 켜기]를 다시 눌러주세요.',
    });
  }

  webpush.setVapidDetails(
    'mailto:seongsa.alert@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const results = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        sub,
        JSON.stringify({
          title: '🎾 성사코트 테스트 알림',
          body: '이 알림이 떴다면 100% 정상 작동 중입니다!',
          url: 'https://www.gytennis.or.kr/daily/4',
        })
      );
      results.push({ ok: true });
    } catch (err) {
      results.push({ ok: false, statusCode: err.statusCode, message: err.message, body: err.body });
    }
  }

  return NextResponse.json({ subsCount: subs.length, results });
}
