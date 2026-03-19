import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  name?: string;
}

interface State { hasError: boolean; error?: Error; }

export class NexusErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[NexusErrorBoundary:${this.props.name}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex items-center justify-center h-12 text-xs text-white/30 rounded-lg border border-white/5">
          {this.props.name ?? 'Component'} unavailable
        </div>
      );
    }
    return this.props.children;
  }
}
