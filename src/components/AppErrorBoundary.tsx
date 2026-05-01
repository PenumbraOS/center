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
        <div className="app-error-shell">
          <div className="app-danger-card app-error-card app-flow app-flow--sm">
            <h1 className="app-page-title app-danger-title">Something Went Wrong</h1>
            <p className="app-panel-copy">
              PenumbraOS hit an unexpected error. Open the browser console for details
              and reload the page to try again.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
