import React, { Component, ErrorInfo, ReactNode } from 'react';
import { reportError } from 'analytics';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    // reportError never throws and is a no-op when Sentry is not initialized.
    void reportError(error, { componentStack: errorInfo.componentStack });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-md mx-auto text-center mt-10 bg-white rounded-xl shadow border border-red-100">
          <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-4">The application encountered an unexpected error.</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition"
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
