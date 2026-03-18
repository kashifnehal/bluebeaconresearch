import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { PriceTicker } from "@/components/layout/PriceTicker";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-app">
      <Sidebar />
      <TopBar />
      <div className="lg:ml-[240px]">
        <PriceTicker />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

