import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";
import { phoneLayerTestIncludes } from "./phone-layer/vite-plugin";

export default defineConfig((configEnv) =>
  mergeConfig(
    viteConfig(configEnv),
    defineConfig({
      test: {
        environment: "jsdom",
        css: {
          modules: {
            classNameStrategy: "non-scoped",
          },
        },
        setupFiles: ["src/vitest.setup.ts"],
        include: [
          "src/**/*.test.ts",
          "src/**/*.test.tsx",
          // Element X+ phone-layer: in fork mode also scan the mirror tree.
          // Empty array in vanilla mode, so upstream test discovery is
          // unchanged.
          ...phoneLayerTestIncludes(),
        ],
        coverage: {
          reporter: ["html", "json"],
          include: ["src/**/*.{ts,tsx,js,jsx}"],
          exclude: [
            "src/**/*.md",
            "src/**/*.{d,test,stories}.{ts,tsx}",
            "src/utils/test.ts",
            "src/utils/test-viewmodel.ts",
            "src/utils/test-fixtures.ts",
            "playwright/**",
          ],
        },
      },
    }),
  ),
);
