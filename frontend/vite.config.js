import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData(source, file) {
            // Don't prepend imports to the partial files themselves.
            if (/_(variables|mixins)\.scss$/.test(file)) return source;
            return `@import "@/styles/variables";\n@import "@/styles/mixins";\n${source}`;
          },
          quietDeps: true,
          silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin', 'color-functions'],
        },
      },
    },
    server: {
      port: Number(env.VITE_DEV_PORT || 5173),
      strictPort: false,
      open: false,
    },
    build: {
      sourcemap: true,
    },
  };
});
