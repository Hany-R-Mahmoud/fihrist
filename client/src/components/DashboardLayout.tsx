import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useLocale } from "@/i18n/LocaleContext";
import React from "react";
import CloudSignIn from "@/pages/CloudSignIn";
import { cloudMode, neonAuth } from "@/lib/neonAuth";
import { isGuestMode, leaveGuestMode } from "@/lib/guestLibrary";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Bookmark,
  Download,
  FolderTree,
  Library,
  HeartPulse,
  Languages,
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

export type FihristView = "all" | "collections" | "shelves" | "health";

type DashboardLayoutProps = {
  activeView: FihristView;
  onViewChange: (view: FihristView) => void;
  onAddBookmark: () => void;
  onImport: () => void;
  onExport: () => void;
  exportPending: boolean;
  /** True when a link report has landed and has not been read yet. */
  digestUnread?: boolean;
  children: React.ReactNode;
};

const navigation: Array<{
  id: FihristView;
  label: "app.nav.allLinks" | "app.nav.collections" | "app.nav.shelves" | "app.nav.health";
  icon: typeof Bookmark;
}> = [
  { id: "all", label: "app.nav.allLinks", icon: Bookmark },
  { id: "collections", label: "app.nav.collections", icon: FolderTree },
  { id: "shelves", label: "app.nav.shelves", icon: Library },
  { id: "health", label: "app.nav.health", icon: HeartPulse },
];

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLocale();
  const isDark = theme === "dark";
  const label = isDark ? t("app.switchToLight") : t("app.switchToDark");

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      onClick={toggleTheme}
      className={
        compact
          ? "grid h-10 w-10 place-items-center rounded-xl text-foreground transition-colors hover:bg-muted"
          : "flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-sidebar-foreground/80 transition-colors hover:bg-sidebar-foreground/10"
      }
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {!compact ? (
        <span className="text-sm">
          {isDark ? t("app.lightMode") : t("app.darkMode")}
        </span>
      ) : null}
    </button>
  );
}

function LocaleToggle({ compact = false }: { compact?: boolean }) {
  const { locale, toggleLocale, t } = useLocale();
  const label =
    locale === "ar" ? t("app.switchToEnglish") : t("app.switchToArabic");

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={toggleLocale}
      className={
        compact
          ? "grid h-10 w-10 place-items-center rounded-xl text-foreground transition-colors hover:bg-muted"
          : "flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-sidebar-foreground/80 transition-colors hover:bg-sidebar-foreground/10"
      }
    >
      <Languages className="h-4 w-4" />
      {!compact ? (
        <span className="text-sm">
          {locale === "ar" ? "English" : "العربية"}
        </span>
      ) : null}
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
  digestUnread = false,
  children,
}: DashboardLayoutProps) {
  const { loading, user } = useAuth();
  const { t } = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);
  const guest = cloudMode && isGuestMode();
  const goToSignIn = () => {
    leaveGuestMode();
    window.location.assign("/sign-in");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-5 py-6">
        <div className="mx-auto max-w-7xl animate-pulse space-y-5">
          <div className="h-14 w-64 rounded-2xl bg-muted" />
          <div className="grid gap-5 lg:grid-cols-[244px_1fr]">
            <div className="h-[560px] rounded-3xl bg-muted" />
            <div className="h-[560px] rounded-3xl bg-muted/70" />
          </div>
        </div>
      </div>
    );
  }

  if (!user && cloudMode) return <CloudSignIn />;

  if (!user) {
    return (
      <main className="fihrist-app fihrist-auth relative min-h-screen px-5 py-10 sm:px-8">
        <div className="absolute end-5 top-5 flex items-center gap-2 sm:end-8 sm:top-8">
          <LocaleToggle compact />
          <ThemeToggle compact />
        </div>
        <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl flex-col justify-center">
          <div className="mb-9 flex items-center gap-3 text-foreground">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Bookmark className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <span className="text-xl font-semibold tracking-[-0.03em]">
              {t("app.name")}
            </span>
          </div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.19em] text-muted-foreground">
            {t("app.auth.tagline")}
          </p>
          <h1 className="fihrist-display max-w-lg text-4xl font-semibold leading-[1.06] tracking-[-0.055em] text-foreground sm:text-5xl">
            {t("app.auth.headline")}
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
            {t("app.auth.failure")}
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
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-xl text-foreground transition-colors hover:bg-muted"
            aria-label={t("app.openNavigation")}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2.5 font-semibold tracking-[-0.025em]">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-sidebar text-sidebar-foreground">
              <Bookmark className="h-4 w-4" />
            </span>
            {t("app.name")}
          </div>
          <div className="flex items-center gap-1.5">
            <LocaleToggle compact />
            <ThemeToggle compact />
            <Button
              type="button"
              size="icon"
              className="h-10 w-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={onAddBookmark}
              aria-label={t("app.addBookmark")}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[290px] border-r-0 bg-sidebar px-4 py-5 text-sidebar-foreground sm:max-w-[290px]"
        >
          <SheetHeader className="mb-5 px-1 py-0">
            <SheetTitle className="flex items-center gap-2.5 text-sidebar-foreground">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
                <Bookmark className="h-4 w-4" />
              </span>
              {t("app.name")}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {t("app.sheetDescription")}
            </SheetDescription>
          </SheetHeader>
          <SidebarNavigation
            activeView={activeView}
            onViewChange={closeAndNavigate}
            digestUnread={digestUnread}
          />
          <div className="mt-auto space-y-3">
            <LocaleToggle />
            {guest && (
              <button
                type="button"
                className="h-10 w-full rounded-xl bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground"
                onClick={goToSignIn}
              >
                Sign in to sync · Guest is local
              </button>
            )}
            {cloudMode && !guest && (
              <button
                type="button"
                className="h-10 w-full rounded-xl bg-sidebar-foreground/15 text-sm font-semibold text-sidebar-foreground"
                onClick={async () => {
                  await neonAuth.signOut();
                  window.location.assign("/");
                }}
              >
                Sign out
              </button>
            )}
            <ThemeToggle />
            <Button
              variant="outline"
              className="h-10 w-full justify-start rounded-xl border-sidebar-foreground/20 bg-sidebar-foreground/10 text-sidebar-foreground hover:bg-sidebar-foreground/15"
              onClick={() => {
                onImport();
                setMobileOpen(false);
              }}
            >
              <Upload className="mr-2 h-4 w-4" /> {t("app.importFile")}
            </Button>
            <Button
              variant="outline"
              disabled={exportPending}
              className="h-10 w-full justify-start rounded-xl border-sidebar-foreground/20 bg-sidebar-foreground/10 text-sidebar-foreground hover:bg-sidebar-foreground/15"
              onClick={() => {
                onExport();
                setMobileOpen(false);
              }}
            >
              <Download className="mr-2 h-4 w-4" /> {t("app.exportFile")}
            </Button>
            <Button
              className="h-10 w-full justify-start rounded-xl bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
              onClick={() => {
                onAddBookmark();
                setMobileOpen(false);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> {t("app.addBookmark")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <div className="mx-auto flex min-h-screen max-w-[1540px] lg:p-4">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[248px] shrink-0 flex-col overflow-hidden rounded-[1.6rem] bg-sidebar px-3.5 py-5 text-sidebar-foreground lg:flex">
          <div className="mb-9 flex items-center gap-2.5 px-2.5 font-semibold tracking-[-0.025em]">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
              <Bookmark className="h-4 w-4" strokeWidth={2.3} />
            </span>
            <span>{t("app.name")}</span>
          </div>
          <SidebarNavigation
            activeView={activeView}
            onViewChange={onViewChange}
            digestUnread={digestUnread}
          />
          <div className="mt-auto space-y-3 px-1">
            {guest && (
              <button
                type="button"
                className="h-10 w-full rounded-xl bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground"
                onClick={goToSignIn}
              >
                Sign in to sync · Guest is local
              </button>
            )}
            <Button
              variant="outline"
              className="h-10 w-full justify-start rounded-xl border-sidebar-foreground/20 bg-sidebar-foreground/10 text-sidebar-foreground hover:bg-sidebar-foreground/15"
              onClick={onImport}
            >
              <Upload className="mr-2 h-4 w-4" />
              {t("app.importFile")}
            </Button>
            <Button
              variant="outline"
              disabled={exportPending}
              className="h-10 w-full justify-start rounded-xl border-sidebar-foreground/20 bg-sidebar-foreground/10 text-sidebar-foreground hover:bg-sidebar-foreground/15"
              onClick={onExport}
            >
              <Download className="mr-2 h-4 w-4" />
              {t("app.exportFile")}
            </Button>
            <Button
              className="h-10 w-full justify-start rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-black/20 hover:bg-sidebar-primary/90"
              onClick={onAddBookmark}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("app.addBookmark")}
            </Button>
            <LocaleToggle />
            <ThemeToggle />
            <div className="mt-4 flex items-center gap-2.5 px-1.5 py-2 text-sidebar-foreground/80">
              <Avatar className="h-8 w-8 border border-sidebar-foreground/20 bg-sidebar-foreground/10">
                <AvatarFallback className="bg-transparent text-[10px] font-semibold text-sidebar-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm">
                {guest
                  ? "Guest — on this device"
                  : cloudMode
                    ? user.email || "Cloud library"
                    : t("app.localLibrary")}
              </span>
              {cloudMode && !guest && (
                <button
                  type="button"
                  className="text-xs text-sidebar-foreground/80 underline"
                  onClick={async () => {
                    await neonAuth.signOut();
                    window.location.assign("/");
                  }}
                >
                  Sign out
                </button>
              )}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarNavigation({
  activeView,
  onViewChange,
  digestUnread = false,
}: {
  activeView: FihristView;
  onViewChange: (view: FihristView) => void;
  digestUnread?: boolean;
}) {
  const { t } = useLocale();
  return (
    <nav aria-label={t("app.primaryNavigation")} className="space-y-1">
      {navigation.map(item => {
        const Icon = item.icon;
        const active = item.id === activeView;
        const unread = digestUnread && item.id === "all";
        return (
          <button
            type="button"
            key={item.id}
            onClick={() => onViewChange(item.id)}
            aria-current={active ? "page" : undefined}
            className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm transition-all ${
              active
                ? "bg-sidebar-accent font-medium text-sidebar-primary"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            }`}
          >
            <Icon
              className="h-[17px] w-[17px]"
              strokeWidth={active ? 2.4 : 2}
            />
            {t(item.label)}
            {unread ? (
              <span className="ms-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                {t("digest.newBadge")}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
