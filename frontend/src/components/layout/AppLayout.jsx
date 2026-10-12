import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileTabBar } from './MobileTabBar';

export function AppLayout() {
  return (
    <div className="flex h-dvh-safe bg-[#0B0F17] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-3 md:px-4 pb-tabbar custom-scrollbar">
          <Outlet />
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
