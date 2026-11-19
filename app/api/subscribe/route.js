import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function POST(req) {
  const subscription = await req.json();
  const subs = (await redis.get('subscriptions')) || [];
  const exists = subs.some((s) => s.endpoint === subscription.endpoint);
  if (!exists) {
    subs.push(subscription);
    await redis.set('subscriptions', subs);
  }
  return NextResponse.json({ ok: true });
}
