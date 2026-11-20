"use client";

import React, { Component, type ReactNode } from "react";

export interface ChunkErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  variant?: "modal" | "inline";
}

interface ChunkErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/** True for failed dynamic imports; anything else is a real bug and must not read as a network problem. */
export function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  return (
    error.name === "ChunkLoadError" ||
    /ChunkLoadError|load(?:ing)? (?:css )?chunk|dynamically imported module/i.test(error.message)
  );
}

export default class ChunkErrorBoundary extends Component<
  ChunkErrorBoundaryProps,
  ChunkErrorBoundaryState
> {
  state: ChunkErrorBoundaryState = { hasError: false, error: null };
  private containerRef = React.createRef<HTMLDivElement>();
  private retryButtonRef = React.createRef<HTMLButtonElement>();
  private previousActiveElement: HTMLElement | null = null;
  private originalOverflow: string = "";

  static getDerivedStateFromError(error: Error): ChunkErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Chunk load error caught by boundary:", error, errorInfo);
  }

  componentDidMount() {
    if (this.state.hasError) {
      this.setupAccessibility();
    }
  }

  componentDidUpdate(prevProps: ChunkErrorBoundaryProps, prevState: ChunkErrorBoundaryState) {
    if (!prevState.hasError && this.state.hasError) {
      this.setupAccessibility();
    } else if (prevState.hasError && !this.state.hasError) {
      this.teardownAccessibility();
    }
  }

  componentWillUnmount() {
    if (this.state.hasError) {
      this.teardownAccessibility();
    }
  }

  private setupAccessibility() {
    this.previousActiveElement = document.activeElement as HTMLElement | null;
    if (this.props.variant !== "inline") {
      this.originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    setTimeout(() => {
      this.retryButtonRef.current?.focus();
    }, 10);

    window.addEventListener("keydown", this.handleKeyDown);
  }

  private teardownAccessibility() {
    if (this.props.variant !== "inline" && this.originalOverflow !== undefined) {
      document.body.style.overflow = this.originalOverflow;
    }
    window.removeEventListener("keydown", this.handleKeyDown);
    if (this.previousActiveElement && document.contains(this.previousActiveElement)) {
      this.previousActiveElement.focus();
    }
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.handleDismiss();
      return;
    }

    if (e.key === "Tab" && this.containerRef.current) {
      const focusables = this.containerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  handleDismiss = () => {
    this.setState({ hasError: false, error: null });
    this.props.onDismiss?.();
  };

  render() {
    if (this.state.hasError) {
      // Let unrelated render errors reach the nearest outer boundary instead of showing a connection message.
      if (!isChunkLoadError(this.state.error)) throw this.state.error;

      const title =
        this.props.fallbackTitle || "Unable to load options. Please check your connection.";
      const description =
        this.props.fallbackDescription ||
        "A network interruption prevented loading this section. You can try again or close.";

      if (this.props.variant === "inline") {
        return (
          <div
            ref={this.containerRef}
            role="alert"
            className="flex flex-col items-center justify-center p-6 text-center space-y-4 rounded-2xl bg-amber-50/60 border border-amber-200"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-stone-900 text-sm">{title}</p>
              <p className="text-xs text-stone-600 max-w-xs">{description}</p>
            </div>
            <div className="flex gap-3 justify-center pt-1">
              {this.props.onDismiss && (
                <button
                  type="button"
                  onClick={this.handleDismiss}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition shadow-xs focus:outline-none focus:ring-2 focus:ring-[#DBAF82]"
                >
                  Close
                </button>
              )}
              <button
                ref={this.retryButtonRef}
                type="button"
                onClick={this.handleRetry}
                className="rounded-xl bg-[#DBAF82] px-4 py-2 text-xs font-semibold text-white hover:bg-[#c99e71] transition shadow-xs focus:outline-none focus:ring-2 focus:ring-[#DBAF82]"
              >
                Retry
              </button>
            </div>
          </div>
        );
      }

      return (
        <div
          ref={this.containerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Error loading content"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs transition-opacity"
          onClick={(e) => {
            if (e.target === e.currentTarget) this.handleDismiss();
          }}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-center space-y-4 border border-stone-200">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-stone-900 text-sm">{title}</p>
              <p className="text-xs text-stone-600">{description}</p>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              {this.props.onDismiss && (
                <button
                  type="button"
                  onClick={this.handleDismiss}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition shadow-xs focus:outline-none focus:ring-2 focus:ring-[#DBAF82]"
                >
                  Cancel
                </button>
              )}
              <button
                ref={this.retryButtonRef}
                type="button"
                onClick={this.handleRetry}
                className="rounded-xl bg-[#DBAF82] px-4 py-2 text-xs font-semibold text-white hover:bg-[#c99e71] transition shadow-xs focus:outline-none focus:ring-2 focus:ring-[#DBAF82]"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
