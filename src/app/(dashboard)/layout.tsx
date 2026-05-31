import { AuthGuard } from "@/components/auth-guard";
import Sidebar from "@/components/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-dvh bg-background text-foreground">
        <Sidebar />
        <main className="ml-60 min-w-0 flex-1 overflow-auto p-6 max-md:ml-0 max-md:p-4 max-md:pt-16">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
