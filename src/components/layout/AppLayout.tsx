"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import type { UserRole } from "@/types";

interface AppLayoutProps {
  children: React.ReactNode;
  userRole?: UserRole;
  userName?: string;
  userId?: string;
}

export function AppLayout({ children, userRole = "operario", userName, userId: _userId }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] bg-gray-50 overflow-hidden">
      {/* Sidebar desktop */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <Sidebar userRole={userRole} userName={userName} />
      </div>

      {/* Sidebar mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-50 flex">
            <Sidebar
              userRole={userRole}
              userName={userName}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar mobile */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 active:bg-gray-200 touch-manipulation"
            aria-label="Abrir menú"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-bold text-gray-900 flex-1 truncate">Batea</span>
          {userName && (
            <span className="text-xs text-gray-500 truncate max-w-[30%]">{userName}</span>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto overscroll-y-contain">
          {children}
        </main>
      </div>
    </div>
  );
}
