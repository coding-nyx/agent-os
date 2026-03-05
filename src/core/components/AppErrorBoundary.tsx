import React from 'react';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[APP_RUNTIME_BOUNDARY] Uncaught render error', {
      path: window.location.pathname,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-[#020205] flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-3xl border border-indigo-500/30 bg-indigo-500/10 backdrop-blur-xl p-8 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-300 mb-3">Runtime Boundary</p>
            <h2 className="text-xl font-black italic uppercase tracking-wide text-white mb-3">System Recovered From Fault</h2>
            <p className="text-sm text-white/70 leading-relaxed mb-6">
              A runtime error interrupted this view. Reload to restore the neural link.
            </p>
            <button
              onClick={this.handleReload}
              className="px-5 py-3 rounded-xl bg-indigo-500/80 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-[0.2em] transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
