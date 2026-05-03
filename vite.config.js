import { defineConfig, loadEnv } from 'vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    root: 'src',
    define: {
      __VITE_SUPABASE_URL__: JSON.stringify(env.VITE_SUPABASE_URL || ''),
      __VITE_SUPABASE_KEY__: JSON.stringify(env.VITE_SUPABASE_KEY || ''),
    },
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main:    resolve(__dirname, 'src/index.html'),
          landing: resolve(__dirname, 'src/landing.html'),
          verify:  resolve(__dirname, 'src/verify.html'),
          admin:   resolve(__dirname, 'src/admin.html'),
        }
      }
    },
    server: {
      port: 3000,
      open: true
    }
  }
})
