import { Component, createRef } from 'react';
import type { ReactNode } from 'react';

/** A failed render stays stopped until the user explicitly reloads the renderer. */
export class RendererErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  private readonly message = createRef<HTMLElement>();

  static getDerivedStateFromError() { return { failed: true }; }

  override componentDidCatch() { this.message.current?.focus(); }

  override render() {
    if (!this.state.failed) return this.props.children;
    return <main ref={this.message} className="renderer-recovery" role="alert" tabIndex={-1} aria-labelledby="renderer-recovery-title">
      <div><span className="renderer-recovery-eyebrow">NEXUS AI</span>
        <h1 id="renderer-recovery-title">This screen could not be displayed</h1>
        <p>Reload Nexus to reconnect. You may need to enter unsaved edits again.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload Nexus</button>
      </div>
    </main>;
  }
}
