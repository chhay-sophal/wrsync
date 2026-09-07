import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // VS Code webviews load the built HTML through their own vscode-webview:// resource
  // scheme, not from a real root - relative asset paths (./assets/...) let the extension
  // rewrite them via webview.asWebviewUri() at load time; absolute paths (the Vite default)
  // wouldn't resolve to anything there.
  base: './',
})
