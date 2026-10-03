import { RegistryProvider } from "@effect/atom-react";
import { HeadContent, Outlet, Scripts, createRootRoute, useHydrated } from "@tanstack/react-router";
import { PanelLeftCloseIcon, PanelLeftIcon } from "lucide-react";
import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar.tsx";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

import "@/app.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Starter Chat" },
    ],
  }),
  shellComponent: Document,
  component: App,
});

function App() {
  // The provider does not inherit the package default, which sweeps unused atoms after 400ms.
  return (
    <RegistryProvider defaultIdleTTL={400}>
      <TooltipProvider>
        <SidebarProvider>
          <SidebarToggle />
          <AppSidebar />
          <SidebarInset className="h-dvh overflow-hidden">
            <Outlet />
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </RegistryProvider>
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

function Document({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
