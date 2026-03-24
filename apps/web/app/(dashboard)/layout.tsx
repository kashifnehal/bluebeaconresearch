import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0e0e0e" }}>
      <Sidebar />
      {/* Main content pushed 256px to the right of the fixed sidebar */}
      <div className="flex flex-col min-h-screen" style={{ marginLeft: "256px" }}>
        <TopBar />
        {/* Children manage their own padding/overflow */}
        <main className="flex-1" style={{ backgroundColor: "#0e0e0e" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
