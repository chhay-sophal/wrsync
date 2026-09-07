import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Root } from './Root.tsx'
import vscodeApi from './vscodeApi.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

// Tells the extension this script has loaded and is ready to receive postMessage() calls -
// sending anything before this point would be silently dropped on the extension side.
vscodeApi.postMessage({ type: 'ready' })
