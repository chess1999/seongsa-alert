import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#15803d' }}>
        <svg width="120" height="120" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="#bef264" />
          <path d="M18 22 C40 42, 40 58, 18 78" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
          <path d="M82 22 C60 42, 60 58, 82 78" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
