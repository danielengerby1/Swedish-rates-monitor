import Dashboard from "@/components/Dashboard";
import { loadData } from "@/lib/load";

export default function Page() {
  const data = loadData();
  if (!data) {
    return (
      <main className="wrap">
        <h1>Swedish Rates &amp; Inflation Monitor</h1>
        <p className="lede">The first data snapshot is being prepared. Check back in a few minutes.</p>
      </main>
    );
  }
  return <Dashboard data={data} />;
}
