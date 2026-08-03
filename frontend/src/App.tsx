import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DownloadQueuePanel } from "./components/DownloadQueuePanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { LoginGate } from "./components/LoginGate";
import { NavBar } from "./components/NavBar";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { DownloadQueueProvider } from "./context/DownloadQueueContext";
import { LibraryDetail } from "./pages/LibraryDetail";
import { Libraries } from "./pages/Libraries";
import { MovieDetail } from "./pages/MovieDetail";
import { Movies } from "./pages/Movies";
import { NotFound } from "./pages/NotFound";
import { Search } from "./pages/Search";
import { SeasonDetail } from "./pages/SeasonDetail";
import { ShowDetail } from "./pages/ShowDetail";
import { Shows } from "./pages/Shows";

function AppShell() {
  const { authMode, user, loading } = useAuth();

  // Wait for the initial /api/auth/me check before deciding what to render — otherwise a
  // required-mode deployment would flash the login gate open for a moment even for someone with a
  // valid session, or vice versa.
  if (loading) return <LoadingSpinner />;
  if (authMode === "required" && !user) return <LoginGate />;

  return (
    <DownloadQueueProvider>
      <BrowserRouter>
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
            <Route path="/search" element={<Search />} />
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
