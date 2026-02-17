import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => ({
  // Use root path in dev, custom path in production
  base: command === "serve" ? "/" : "/BIM-Composer/",
  root: ".",
  plugins: [
    {
      name: "create-nojekyll",
      closeBundle() {
        const nojekyllPath = path.resolve(__dirname, "dist", ".nojekyll");
        fs.writeFileSync(nojekyllPath, "", "utf8");
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@core": path.resolve(__dirname, "./src/core"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@viewer": path.resolve(__dirname, "./src/viewer"),
      "@utils": path.resolve(__dirname, "./src/utils"),
      "@shared": path.resolve(__dirname, "./src/shared"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: "./index.html",
      },
      output: {
        // Manual code splitting for better caching
        manualChunks: {
          // Vendor chunks
          "vendor-three": ["three"],
          "vendor-utils": ["js-sha256"],
          "vendor-ifc": ["web-ifc"],

          // Core chunks
          "core-state": [
            "./src/core/state/store.js",
            "./src/core/state/reducer.js",
            "./src/core/state/actions/index.js",
            "./src/core/state/helpers.js",
          ],
          "core-services": [
            "./src/core/services/LayerService.js",
            "./src/core/services/PrimService.js",
          ],
          "core-errors": [
            "./src/core/errors/errors.js",
            "./src/core/errors/ErrorHandler.js",
          ],

          // Feature chunks
          viewer: [
            "./src/viewer/ThreeScene.js",
            "./src/viewer/sceneSetup.js",
            "./src/viewer/spatialHash.js",
            "./src/viewer/selectionController.js",
          ],
          "usda-parser": [
            "./src/viewer/usda/usdaParser.js",
            "./src/viewer/usda/usdaMerger.js",
            "./src/viewer/usda/usdaComposer.js",
            "./src/viewer/usda/usdaEditor.js",
          ],
        },
        // Better file names for caching
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
    // Minification settings
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: false, // Keep console for now
        drop_debugger: true,
      },
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  // Optimizations
  optimizeDeps: {
    include: ["three", "js-sha256"],
    exclude: ["web-ifc"],
  },
  // Handle WASM files for web-ifc
  assetsInclude: ["**/*.wasm"],
  // Test configuration
  test: {
    globals: true,
    environment: "jsdom",
    exclude: ["node_modules/**", "src/__tests__/e2e/**"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.js"],
      exclude: [
        "node_modules/**",
        "src/__tests__/**",
        "**/*.test.js",
        "**/*.spec.js",
        "dist/**",
        "coverage/**",
        "**/*.config.js",
        "**/setup.js",
        "src/main.js",
        "src/state.js",
        "src/components/modalController.test.js",
      ],
      thresholds: {
        lines: 40,
        functions: 40,
        branches: 35,
        statements: 40,
      },
    },
    setupFiles: ["./src/__tests__/setup.js"],
  },
}));
