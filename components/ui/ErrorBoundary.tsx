"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { ShieldAlert, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error inside ErrorBoundary:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0F1117] text-gray-900 dark:text-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
          {/* Decorative Glow */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-650/[0.03] dark:bg-red-500/10 rounded-full blur-[120px] pointer-events-none" />

          <div className="z-10 w-full max-w-md bg-white dark:bg-[#161B22] border border-gray-200 dark:border-[#30363D] rounded-3xl p-8 shadow-xl dark:shadow-black/50 text-center space-y-6">
            <div className="mx-auto h-12 w-12 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center text-red-500">
              <ShieldAlert className="h-6 w-6" />
            </div>

            <div className="space-y-2">
              <h2 className="text-base font-bold text-gray-950 dark:text-white">Something went wrong</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                An unexpected rendering error occurred. This console is fully sandboxed, and no system data has been lost.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/30 text-red-750 dark:text-red-400 rounded-xl text-[10px] font-mono text-left overflow-auto max-h-32 whitespace-pre-wrap break-all">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex gap-3 border-t border-gray-150 dark:border-gray-800 pt-5">
              <button
                onClick={this.handleGoHome}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold bg-gray-50 hover:bg-gray-100 dark:bg-[#1C2128] dark:hover:bg-gray-800 border border-gray-200 dark:border-[#30363D] text-gray-700 dark:text-gray-300 transition flex items-center justify-center gap-1.5"
              >
                <Home className="h-3.5 w-3.5" /> Home
              </button>
              <button
                onClick={this.handleReset}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
