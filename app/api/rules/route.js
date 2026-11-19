import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  const rules = (await redis.get('rules')) || [];
  const dnd = (await redis.get('dnd')) || { enabled: true, start: '01:00', end: '05:30' };
  return NextResponse.json({ rules, dnd });
}

export async function POST(req) {
  const body = await req.json();
  if (body.type === 'dnd') {
    await redis.set('dnd', body.dnd);
    return NextResponse.json({ ok: true });
  }
  const rules = (await redis.get('rules')) || [];
  rules.push({ ...body.rule, id: Date.now().toString() });
  await redis.set('rules', rules);
  return NextResponse.json({ ok: true, rules });
}

export async function DELETE(req) {
  const { id } = await req.json();
  const rules = (await redis.get('rules')) || [];
  const next = rules.filter((r) => r.id !== id);
  await redis.set('rules', next);
  return NextResponse.json({ ok: true, rules: next });
}
