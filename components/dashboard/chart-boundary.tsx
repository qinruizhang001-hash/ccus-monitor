"use client";

import { Component, type ReactNode } from "react";

export class ChartBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-[200px] flex-col items-start justify-center gap-2 rounded-lg border border-dashed border-white/10 px-3 text-sm text-muted-foreground">
          <p>这条曲线没有画出来。</p>
          <button
            type="button"
            className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-foreground"
            onClick={() => this.setState({ failed: false })}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
