import React from 'react';
import { Spine } from '@/lib/spine/spine-event-bus';

interface Props {
  children: React.ReactNode;
  moduleName: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Per-module error boundary that catches render errors within a single module
 * without tearing down the entire app. Shows a recovery UI and emits a Spine
 * event so the rest of the system can react (e.g. cascade rules, logging).
 */
export class ModuleErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ModuleErrorBoundary:${this.props.moduleName}]`, error, info);
    try {
      Spine.emit({
        type: 'SYSTEM_HEALTH_CHECK',
        source: this.props.moduleName,
        domain: 'system',
        data: {
          event: 'module_render_crash',
          module: this.props.moduleName,
          message: error.message,
          componentStack: info.componentStack,
        },
        cascadeDepth: 0,
        priority: 'warning',
      });
    } catch {
      // Spine itself may not be available — don't cascade the failure.
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[50vh] p-8 text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/40 mb-3">
            Module Fault
          </p>
          <h2 className="text-lg font-bold text-white/80 mb-2">
            {this.props.moduleName} encountered an error
          </h2>
          <p className="text-sm text-white/50 leading-relaxed mb-6 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-[0.15em] transition-colors border border-white/10"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
