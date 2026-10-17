import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import CloudLibraryPending from "./pages/CloudLibraryPending";

function Router() {
  // Never expose the local-only SQLite/tRPC library on a public origin.
  // Cloud mode may be enabled only after Neon auth and account isolation tests pass.
  const cloudEnabled = import.meta.env.VITE_FIHRIST_CLOUD_LIBRARY_ENABLED === "true";
  const isLocalHost = typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const LibraryPage = cloudEnabled || isLocalHost ? Home : CloudLibraryPending;
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Landing} />
      <Route path={"/library"} component={LibraryPage} />
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
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
