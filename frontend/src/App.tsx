import { useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DownloadQueuePanel } from "./components/DownloadQueuePanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { LoginGate } from "./components/LoginGate";
import { NavBar } from "./components/NavBar";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { DownloadQueueProvider } from "./context/DownloadQueueContext";
import { useScrollRestoration } from "./hooks/useScrollRestoration";
import { LibraryDetail } from "./pages/LibraryDetail";
import { Libraries } from "./pages/Libraries";
import { MovieDetail } from "./pages/MovieDetail";
import { Movies } from "./pages/Movies";
import { NotFound } from "./pages/NotFound";
import { Search, type SearchResult } from "./pages/Search";
import { SeasonDetail } from "./pages/SeasonDetail";
import { ShowDetail } from "./pages/ShowDetail";
import { Shows } from "./pages/Shows";

// useScrollRestoration needs Router context (useLocation/useNavigationType), which only exists
// inside <BrowserRouter> — this headless component is just a mount point for it there.
function ScrollRestorer() {
  useScrollRestoration();
  return null;
}

function AppShell() {
  const { authMode, user, loading } = useAuth();
  // Lifted above <Routes> (rather than local state in Search itself) so navigating to a result and
  // hitting back — which unmounts/remounts the Search route — doesn't lose the query or results.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);

  // Wait for the initial /api/auth/me check before deciding what to render — otherwise a
  // required-mode deployment would flash the login gate open for a moment even for someone with a
  // valid session, or vice versa.
  if (loading) return <LoadingSpinner />;
  if (authMode === "required" && !user) return <LoginGate />;

  return (
    <DownloadQueueProvider>
      <BrowserRouter>
        <ScrollRestorer />
        <NavBar />
        {/* Extra bottom padding on every page so the fixed download panel (bottom-right) never
            permanently covers the last row of a list — there's always room to scroll it clear. */}
        <main className="min-h-[calc(100vh-57px)] pb-48">
          <Routes>
            <Route path="/" element={<Libraries />} />
            <Route path="/library/:id" element={<LibraryDetail />} />
            <Route path="/movies" element={<Movies />} />
            <Route path="/movies/:id" element={<MovieDetail />} />
            <Route path="/shows" element={<Shows />} />
            <Route path="/shows/:id" element={<ShowDetail />} />
            <Route path="/shows/:seriesId/season/:seasonId" element={<SeasonDetail />} />
            <Route
              path="/search"
              element={
                <Search
                  query={searchQuery}
                  onQueryChange={setSearchQuery}
                  result={searchResult}
                  onResultChange={setSearchResult}
                />
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <DownloadQueuePanel />
      </BrowserRouter>
    </DownloadQueueProvider>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}
