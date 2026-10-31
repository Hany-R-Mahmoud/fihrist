import { Toaster } from "@/components/ui/sonner";
import { LibraryCommandBar } from "@/components/LibraryCommandBar";
import { ExtensionBridge } from "@/components/ExtensionBridge";
import { LibraryDialogs } from "@/components/LibraryDialogs";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { OfflineNotice } from "./components/OfflineNotice";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LocaleProvider } from "./i18n/LocaleContext";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import CloudSignIn from "./pages/CloudSignIn";
import { cloudMode } from "./lib/neonAuth";
import { useAuth } from "./_core/hooks/useAuth";

function LibraryGate() {
  const { user, loading, error } = useAuth();
  if (cloudMode && loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        Opening Fihrist…
      </main>
    );
  }
  if (cloudMode && error)
    return (
      <main className="p-8" role="alert">
        Could not open your library. Please try again.
        <button
          type="button"
          className="ml-3 underline"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </main>
    );
  if (cloudMode && !user) return <CloudSignIn />;
  return <Home />;
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Landing} />
      <Route path={"/sign-in"} component={CloudSignIn} />
      <Route path={"/about"} component={Landing} />
      <Route path={"/library"} component={LibraryGate} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <LocaleProvider defaultLocale="ar" switchable>
        <ThemeProvider defaultTheme="light" switchable>
          <TooltipProvider>
            <OfflineNotice />
            <Toaster />
            <Router />
            <ExtensionBridge />
            <LibraryCommandBar />
            <LibraryDialogs />
          </TooltipProvider>
        </ThemeProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
}

export default App;
