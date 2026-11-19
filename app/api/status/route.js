import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const hb = await redis.get('last_heartbeat');
  const diffSec = hb ? Math.floor((Date.now() - hb.time) / 1000) : null;
  const alive = diffSec !== null && diffSec <= 180; // 3분 이내 신호면 정상

  const statusText = !hb
    ? '⚪ 아직 기록 없음'
    : alive
    ? '🟢 정상 작동 중'
    : '🔴 응답 없음 (회사 PC 확인 필요)';

  const timeText = hb ? `${hb.kst} (${diffSec}초 전)` : '기록 없음';

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>성사코트 감시 상태</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f7; }
    .card { background: #fff; padding: 28px 24px; border-radius: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); text-align: center; width: 85%; max-width: 340px; }
    h1 { font-size: 20px; margin: 0 0 16px; }
    .status { font-size: 22px; font-weight: bold; margin-bottom: 12px; }
    .time { color: #666; font-size: 14px; margin-bottom: 20px; }
    button { background: #007aff; color: #fff; border: none; padding: 12px 24px; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🎾 성사코트 감시 상태</h1>
    <div class="status">${statusText}</div>
    <div class="time">마지막 확인: ${timeText}</div>
    <button onclick="location.reload()">새로고침</button>
  </div>
</body>
</html>`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
