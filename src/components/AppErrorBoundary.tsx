import { Component, type ErrorInfo, type ReactNode } from "react";
import { logError } from "../logging";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError(): State {
    return {
      hasError: true,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError("app", "React error boundary caught an error", error, {
      componentStack: errorInfo.componentStack,
      path: window.location.pathname,
    });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-2xl border border-red-900/50 bg-neutral-900 p-6">
            <h1 className="mb-3 text-2xl font-semibold tracking-tight text-red-400">
              Something went wrong
            </h1>
            <p className="text-sm leading-6 text-neutral-300">
              Pin Center hit an unexpected error. Open the browser console for
              details and reload the page to try again.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
