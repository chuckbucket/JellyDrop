import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DownloadQueuePanel } from "./components/DownloadQueuePanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NavBar } from "./components/NavBar";
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

export function App() {
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
