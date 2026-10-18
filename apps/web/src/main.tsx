import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@nexus-ai/ui/styles.css';
import { App } from './App.js';
import { RendererErrorBoundary } from './RendererErrorBoundary.js';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento root di Nexus AI assente.');
// Caught failures render a bounded recovery screen; private error payloads are not logged.
createRoot(root, { onCaughtError: () => undefined }).render(<StrictMode><RendererErrorBoundary><App /></RendererErrorBoundary></StrictMode>);
