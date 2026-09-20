export default function AppLoading() {
  return (
    <main className="dashboard-page" aria-busy="true" aria-label="Loading">
      <div className="page-skeleton skeleton-title" />
      <div className="page-skeleton skeleton-subtitle" />
      <div className="skeleton-grid">
        {Array.from({ length: 6 }, (_, index) => <div className="page-skeleton skeleton-card" key={index} />)}
      </div>
    </main>
  );
}
