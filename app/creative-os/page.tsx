export default function CreativeOSPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#0f0f0f' }}>
      <div style={{ padding: '12px 16px', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Creative OS v1</h1>
        <p style={{ margin: '6px 0 0', opacity: 0.8 }}>Reseller lead pipeline + KPI board</p>
      </div>
      <iframe
        src="/creative-os/index.html"
        title="Creative OS"
        style={{ width: '100%', height: 'calc(100vh - 68px)', border: 'none', display: 'block' }}
      />
    </main>
  );
}
