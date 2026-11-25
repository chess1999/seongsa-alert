import { Redis } from '@upstash/redis';

const baseRedis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const room = (process.env.ROOM_ID || '').trim();
const prefix = room ? `${room}:` : '';

const KEY_METHODS = new Set([
  'get', 'set', 'del', 'exists', 'expire', 'ttl', 'incr', 'decr',
  'sadd', 'srem', 'smembers', 'scard', 'sismember',
  'hget', 'hset', 'hdel', 'hgetall', 'hlen', 'hexists',
  'lpush', 'rpush', 'lpop', 'rpop', 'lrange', 'llen',
]);

export const redis = new Proxy(baseRedis, {
  get(target, prop, receiver) {
    const orig = Reflect.get(target, prop, receiver);
    if (typeof orig !== 'function') return orig;

    if (prefix && typeof prop === 'string' && KEY_METHODS.has(prop)) {
      return (...args) => {
        if (args.length > 0 && typeof args[0] === 'string') {
          if (prop === 'del' || prop === 'exists') {
            args = args.map((k) => (typeof k === 'string' ? `${prefix}${k}` : k));
          } else {
            args[0] = `${prefix}${args[0]}`;
          }
        }
        return orig.apply(target, args);
      };
    }
    return orig.bind(target);
  },
});
