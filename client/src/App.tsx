import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { OfflineNotice } from "./components/OfflineNotice";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LocaleProvider } from "./i18n/LocaleContext";
import Home from "./pages/Home";
import Landing from "./pages/Landing";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Landing} />
      <Route path={"/library"} component={Home} />
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
        <ThemeProvider
          defaultTheme="light"
          switchable
        >
          <TooltipProvider>
            <OfflineNotice />
            <Toaster />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
}

export default App;
