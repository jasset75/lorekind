import svelte from "@astrojs/svelte";
import { defineConfig } from "astro/config";
import { localStudioPlugin } from "./src/server/local-studio-plugin";

export default defineConfig({
  output: "static",
  devToolbar: { enabled: false },
  integrations: [svelte()],
  vite: { plugins: [localStudioPlugin()] },
});
