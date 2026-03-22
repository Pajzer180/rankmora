import Script from 'next/script';

export default function TestSnippetPage() {
  return (
    <div
      style={{
        fontFamily: 'sans-serif',
        color: '#000',
        backgroundColor: '#fff',
        maxWidth: '800px',
        margin: '80px auto',
        padding: '0 24px',
      }}
    >
      <h1>Stary Nagłówek - Do Zmiany</h1>
      <p>
        To jest sterylna strona testowa do sprawdzenia, czy bress.js potrafi
        podmienić powyższy nagłówek H1 po załadowaniu.
      </p>

      <Script
        src="/api/snippet?clientId=123"
        data-client-id="123"
        strategy="afterInteractive"
      />
    </div>
  );
}
