export const metadata = {
  title: '성사전천후 코트 알림',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: '-apple-system, sans-serif', background: '#f3f4f6' }}>
        {children}
      </body>
    </html>
  );
}
