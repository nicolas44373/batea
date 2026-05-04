"use client";

import { usePathname } from "next/navigation";
import { AppLayout } from "./AppLayout";
import { UserProvider, useCurrentUser } from "@/context/UserContext";

function LayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { userId, userName, userRole, loaded } = useCurrentUser();

  const isAuthPage = pathname?.startsWith("/login");

  if (isAuthPage) return <>{children}</>;

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout userRole={userRole} userName={userName} userId={userId}>
      {children}
    </AppLayout>
  );
}

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <LayoutInner>{children}</LayoutInner>
    </UserProvider>
  );
}
