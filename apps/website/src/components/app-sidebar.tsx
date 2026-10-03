import { useAtom, useAtomSuspense } from "@effect/atom-react";
import { Link, useHydrated } from "@tanstack/react-router";
import { AsyncResult } from "effect/reactivity";
import { FolderIcon, LogOutIcon, SearchIcon, SettingsIcon, SquarePenIcon } from "lucide-react";
import { Suspense } from "react";

import { client, meAtom } from "@/atoms.ts";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const signOutAtom = client.mutation("sessions", "deleteCurrent");

/** The app's navigation: new chat, search, past chats, and the signed-in account. */
export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="gap-3 px-3 pt-3">
        {/* The toggle is pinned over this corner by the root layout, so the brand starts after it. */}
        <div className="flex h-6 items-center pl-8">
          <Link to="/" className="text-sm font-semibold tracking-tight">
            Starter <span className="font-normal text-muted-foreground">Chat</span>
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <SidebarInput aria-label="Search chats" placeholder="Search" className="pl-7" />
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  to="/"
                  aria-label="New chat"
                  className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                />
              }
            >
              <SquarePenIcon />
            </TooltipTrigger>
            <TooltipContent>New chat</TooltipContent>
          </Tooltip>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link to="/files" />}>
                <FolderIcon />
                Files
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <p className="px-2 py-6 text-center text-xs text-muted-foreground/70">No chats yet</p>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="flex-row items-center gap-1 px-3 pb-3">
        <Suspense fallback={<span className="flex-1" />}>
          <Account />
        </Suspense>
        <Button variant="ghost" size="icon-sm" aria-label="Settings" disabled>
          <SettingsIcon />
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

function Account() {
  const hydrated = useHydrated();
  const me = useAtomSuspense(meAtom, { includeFailure: true });
  const [signingOut, signOut] = useAtom(signOutAtom, { mode: "promiseExit" });
  if (AsyncResult.isFailure(me)) {
    return (
      <Link to="/sign-in" className={buttonVariants({ variant: "outline", className: "flex-1" })}>
        Sign in
      </Link>
    );
  }
  return (
    <>
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{me.value.name}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Sign out"
        disabled={!hydrated || AsyncResult.isWaiting(signingOut)}
        onClick={() => signOut({ reactivityKeys: ["me", "files"] })}
      >
        <LogOutIcon />
      </Button>
    </>
  );
}
