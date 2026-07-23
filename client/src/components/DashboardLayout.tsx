import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import React from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Bookmark,
  Download,
  FolderTree,
  HeartPulse,
  Menu,
  Moon,
  Plus,
  Sun,
  Upload,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useState } from "react";

export type FihristView = "all" | "collections" | "health";

type DashboardLayoutProps = {
  activeView: FihristView;
  onViewChange: (view: FihristView) => void;
  onAddBookmark: () => void;
  onImport: () => void;
  onExport: () => void;
  exportPending: boolean;
  children: React.ReactNode;
};

const navigation: Array<{
  id: FihristView;
  label: string;
  icon: typeof Bookmark;
}> = [
  { id: "all", label: "All links", icon: Bookmark },
  { id: "collections", label: "Collections", icon: FolderTree },
  { id: "health", label: "Link health", icon: HeartPulse },
];

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      onClick={toggleTheme}
      className={
        compact
          ? "grid h-10 w-10 place-items-center rounded-xl text-[#29483d] transition-colors hover:bg-[#e6ebe3] dark:text-[#d7e2d7] dark:hover:bg-white/10"
          : "flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[#d7e2d7] transition-colors hover:bg-white/5"
      }
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {!compact ? <span className="text-sm">{isDark ? "Light mode" : "Dark mode"}</span> : null}
    </button>
  );
}

export default function DashboardLayout({
  activeView,
  onViewChange,
  onAddBookmark,
  onImport,
  onExport,
  exportPending,
  children,
}: DashboardLayoutProps) {
  const { loading, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f6f1] px-5 py-6">
        <div className="mx-auto max-w-7xl animate-pulse space-y-5">
          <div className="h-14 w-64 rounded-2xl bg-stone-200" />
          <div className="grid gap-5 lg:grid-cols-[244px_1fr]">
            <div className="h-[560px] rounded-3xl bg-stone-200/80" />
            <div className="h-[560px] rounded-3xl bg-stone-200/60" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="fihrist-app fihrist-auth relative min-h-screen px-5 py-10 sm:px-8">
        <div className="absolute right-5 top-5 sm:right-8 sm:top-8">
          <ThemeToggle compact />
        </div>
        <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl flex-col justify-center">
          <div className="mb-9 flex items-center gap-3 text-[#17362d]">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#17362d] text-[#f6f5ef] shadow-lg shadow-[#17362d]/20">
              <Bookmark className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <span className="text-xl font-semibold tracking-[-0.03em]">Fihrist</span>
          </div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.19em] text-[#688070]">
            A personal link library
          </p>
          <h1 className="max-w-lg text-4xl font-semibold leading-[1.06] tracking-[-0.055em] text-[#18342c] sm:text-5xl">
            Your web, kept in good order.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-[#5b665f]">
            Local mode could not open the library. Check the data directory and reload Fihrist.
          </p>
        </section>
      </main>
    );
  }

  const initials = (user.name || user.email || "F")
    .split(/\s+/)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const closeAndNavigate = (view: FihristView) => {
    onViewChange(view);
    setMobileOpen(false);
  };

  return (
    <div className="fihrist-app min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-[#dce2d9]/80 bg-[#f7f6f1]/90 backdrop-blur-xl lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-xl text-[#29483d] transition-colors hover:bg-[#e6ebe3]"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2.5 font-semibold tracking-[-0.025em]">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#17362d] text-[#f7f6f1]">
              <Bookmark className="h-4 w-4" />
            </span>
            Fihrist
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle compact />
            <Button
              type="button"
              size="icon"
              className="h-10 w-10 rounded-xl bg-[#17362d] text-[#f7f6f1] hover:bg-[#21483c]"
              onClick={onAddBookmark}
              aria-label="Add bookmark"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[290px] border-r-0 bg-[#17362d] px-4 py-5 text-[#edf2e9] sm:max-w-[290px]">
          <SheetHeader className="mb-5 px-1 py-0">
            <SheetTitle className="flex items-center gap-2.5 text-[#edf2e9]">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#d9e3d7] text-[#17362d]">
                <Bookmark className="h-4 w-4" />
              </span>
              Fihrist
            </SheetTitle>
            <SheetDescription className="sr-only">Primary navigation and library actions</SheetDescription>
          </SheetHeader>
          <SidebarNavigation activeView={activeView} onViewChange={closeAndNavigate} />
          <div className="mt-auto space-y-3">
            <ThemeToggle />
            <Button variant="outline" className="h-10 w-full justify-start rounded-xl border-white/15 bg-white/5 text-[#edf2e9] hover:bg-white/10 hover:text-white" onClick={() => { onImport(); setMobileOpen(false); }}>
              <Upload className="mr-2 h-4 w-4" /> Import browser file
            </Button>
            <Button variant="outline" disabled={exportPending} className="h-10 w-full justify-start rounded-xl border-white/15 bg-white/5 text-[#edf2e9] hover:bg-white/10 hover:text-white" onClick={() => { onExport(); setMobileOpen(false); }}>
              <Download className="mr-2 h-4 w-4" /> Export browser file
            </Button>
            <Button className="h-10 w-full justify-start rounded-xl bg-[#d9e3d7] text-[#17362d] hover:bg-[#f2f4ef]" onClick={() => { onAddBookmark(); setMobileOpen(false); }}>
              <Plus className="mr-2 h-4 w-4" /> Add bookmark
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <div className="mx-auto flex min-h-screen max-w-[1540px] lg:p-4">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[248px] shrink-0 flex-col overflow-hidden rounded-[1.6rem] bg-[#17362d] px-3.5 py-5 text-[#edf2e9] lg:flex">
          <div className="mb-9 flex items-center gap-2.5 px-2.5 font-semibold tracking-[-0.025em]">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#d9e3d7] text-[#17362d]">
              <Bookmark className="h-4 w-4" strokeWidth={2.3} />
            </span>
            <span>Fihrist</span>
          </div>
          <SidebarNavigation activeView={activeView} onViewChange={onViewChange} />
          <div className="mt-auto space-y-3 px-1">
            <Button
              variant="outline"
              className="h-10 w-full justify-start rounded-xl border-white/15 bg-white/5 text-[#edf2e9] hover:bg-white/10 hover:text-white"
              onClick={onImport}
            >
              <Upload className="mr-2 h-4 w-4" />
              Import browser file
            </Button>
            <Button
              variant="outline"
              disabled={exportPending}
              className="h-10 w-full justify-start rounded-xl border-white/15 bg-white/5 text-[#edf2e9] hover:bg-white/10 hover:text-white"
              onClick={onExport}
            >
              <Download className="mr-2 h-4 w-4" />
              Export browser file
            </Button>
            <Button
              className="h-10 w-full justify-start rounded-xl bg-[#d9e3d7] text-[#17362d] shadow-lg shadow-black/10 hover:bg-[#f2f4ef]"
              onClick={onAddBookmark}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add bookmark
            </Button>
            <ThemeToggle />
            <div className="mt-4 flex items-center gap-2.5 px-1.5 py-2 text-[#d7e2d7]">
              <Avatar className="h-8 w-8 border border-white/15 bg-white/10">
                <AvatarFallback className="bg-transparent text-[10px] font-semibold text-[#edf2e9]">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm">Local library</span>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}

function SidebarNavigation({
  activeView,
  onViewChange,
}: {
  activeView: FihristView;
  onViewChange: (view: FihristView) => void;
}) {
  return (
    <nav aria-label="Primary navigation" className="space-y-1">
      {navigation.map(item => {
        const Icon = item.icon;
        const active = item.id === activeView;
        return (
          <button
            type="button"
            key={item.id}
            onClick={() => onViewChange(item.id)}
            aria-current={active ? "page" : undefined}
            className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm transition-all ${
              active
                ? "bg-[#edf2e9] font-medium text-[#17362d] shadow-sm"
                : "text-[#c5d3c6] hover:bg-white/8 hover:text-white"
            }`}
          >
            <Icon className="h-[17px] w-[17px]" strokeWidth={active ? 2.4 : 2} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
