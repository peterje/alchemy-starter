import { createFileRoute, Outlet, useHydrated } from "@tanstack/react-router";
import { PanelLeftCloseIcon, PanelLeftIcon } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar.tsx";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";

/** Every page of the app sits beside the sidebar; standalone pages such as sign-in do not. */
export const Route = createFileRoute("/_app")({ component: AppLayout });

function AppLayout() {
  return (
    <SidebarProvider>
      <SidebarToggle />
      <AppSidebar />
      <SidebarInset className="h-dvh overflow-hidden">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * One toggle for the sidebar, pinned to the corner outside it, so it stays under the pointer
 * whether the sidebar is open or closed.
 */
function SidebarToggle() {
  const hydrated = useHydrated();
  const { open, openMobile, isMobile, toggleSidebar } = useSidebar();
  const visible = isMobile ? openMobile : open;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle sidebar"
      aria-pressed={visible}
      // Server-rendered markup has no click handler until React hydrates it.
      disabled={!hydrated}
      onClick={toggleSidebar}
      className="fixed top-3 left-3 z-50"
    >
      {visible ? <PanelLeftCloseIcon /> : <PanelLeftIcon />}
    </Button>
  );
}
