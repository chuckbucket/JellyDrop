import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Catches render-time crashes so they show a visible message instead of silently blanking the page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("JellyDrop crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-lg font-semibold text-neutral-100">Something went wrong</p>
          <p className="max-w-md text-sm text-neutral-400">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 rounded-md bg-[var(--color-jelly-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-jelly-accent-hover)]"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
