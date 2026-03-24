"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "next-themes";

export default function SettingsPage() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div>
      <h1 className="text-text-primary text-2xl font-semibold mb-6">Settings</h1>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Tabs defaultValue="account" className="lg:col-span-5">
          <TabsList className="bg-surface-secondary border border-border">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="mt-4">
            <Card className="bg-surface border border-border rounded-xl p-6 shadow-none space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-text-muted text-xs uppercase tracking-wider mb-2">Full name</div>
                  <Input className="h-10 bg-surface-secondary border-border" placeholder="Alex Chen" />
                </div>
                <div>
                  <div className="text-text-muted text-xs uppercase tracking-wider mb-2">Email</div>
                  <Input className="h-10 bg-surface-secondary border-border" placeholder="you@example.com" disabled />
                </div>
              </div>
              <Button className="bg-accent hover:bg-accent-hover text-white h-10 w-full md:w-auto">Save</Button>
            </Card>
          </TabsContent>

          <TabsContent value="appearance" className="mt-4">
            <Card className="bg-surface border border-border rounded-xl p-6 shadow-none">
              <div className="text-text-primary font-medium mb-4">Theme</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  className={`border rounded-xl p-4 text-left ${resolvedTheme === "dark" ? "border-accent border-2" : "border-border bg-surface-secondary"}`}
                  onClick={() => setTheme("dark")}
                >
                  <div className="text-text-primary font-medium">Dark</div>
                  <div className="text-text-muted text-sm mt-1">Trader-default</div>
                </button>
                <button
                  className={`border rounded-xl p-4 text-left ${resolvedTheme === "light" ? "border-accent border-2" : "border-border bg-surface-secondary"}`}
                  onClick={() => setTheme("light")}
                >
                  <div className="text-text-primary font-medium">Light</div>
                  <div className="text-text-muted text-sm mt-1">Day mode</div>
                </button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <Card className="bg-surface border border-border rounded-xl p-6 shadow-none">
              Notifications settings will be implemented in Phase 6.
            </Card>
          </TabsContent>

          <TabsContent value="security" className="mt-4">
            <Card className="bg-surface border border-border rounded-xl p-6 shadow-none">
              Security settings (2FA, sessions) will be implemented in Phase 6.
            </Card>
          </TabsContent>

          <TabsContent value="data" className="mt-4">
            <Card className="bg-surface border border-border rounded-xl p-6 shadow-none">
              Data export + delete account will be implemented in Phase 6.
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
