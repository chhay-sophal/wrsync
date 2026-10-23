import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** `vite --mode mock` only: loads src/dev/mockVscode.ts ahead of main.tsx, so the UI runs in
 * a plain browser tab against fake data (module scripts run in document order, so the mock's
 * acquireVsCodeApi() exists before the app asks for it). Never applied to builds. */
function mockVscode(): Plugin {
  return {
    name: 'wrsync-mock-vscode',
    apply: 'serve',
    transformIndexHtml: (html) =>
      html.replace(
        '<script type="module" src="/src/main.tsx">',
        '<script type="module" src="/src/dev/mockVscode.ts"></script>\n    <script type="module" src="/src/main.tsx">'
      ),
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), mode === 'mock' && mockVscode()],
  // VS Code webviews load the built HTML through their own vscode-webview:// resource
  // scheme, not from a real root - relative asset paths (./assets/...) let the extension
  // rewrite them via webview.asWebviewUri() at load time; absolute paths (the Vite default)
  // wouldn't resolve to anything there.
  base: './',
}))
