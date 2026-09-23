import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { ProductTour } from "@/components/onboarding/ProductTour";
import { FeatureHints } from "@/components/onboarding/FeatureHints";
import { NotificationConnectPrompt } from "@/components/NotificationConnectPrompt";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0e0e0e" }}>
      <ProductTour />
      <FeatureHints />
      <NotificationConnectPrompt />
      <Sidebar />
      {/* Full-width below md (sidebar is off-canvas). 256px left inset at md+
          matches the fixed sidebar, same as the previous inline marginLeft. */}
      <div
        data-testid="dashboard-main-shell"
        className="flex flex-col min-h-screen md:ml-[256px]"
      >
        <TopBar />
        {/* Children manage their own padding/overflow. pb-[60px] below md
            keeps content clear of the fixed MobileTabBar (same height). */}
        <main className="flex-1 pb-[60px] md:pb-0" style={{ backgroundColor: "#0e0e0e" }}>
          {children}
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
