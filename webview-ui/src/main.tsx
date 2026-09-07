import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Tells the extension this script has loaded and is ready to receive postMessage() calls -
// sending anything before this point would be silently dropped on the extension side.
acquireVsCodeApi().postMessage({ type: 'ready' })
