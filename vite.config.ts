import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Fixed (not auto-incrementing) so it stays predictable and matches whatever is
    // listed in the backend's Cors:AllowedOrigins configuration.
    port: 5174,
    strictPort: true,
  },
})
