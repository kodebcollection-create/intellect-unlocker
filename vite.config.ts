// @lovable.dev/vite-tanstack-config already includes tanstackStart, viteReact, tailwindcss, etc.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

function windowsSafeMcpPlugin() {
  const plugin = mcpPlugin() as any;
  const originalConfigResolved = plugin.configResolved;
  plugin.configResolved = function (config: any) {
    const originalRoot = config.root;
    if (process.platform === "win32" && typeof originalRoot === "string") {
      config.root = originalRoot.replace(/\//g, "\\");
    }
    try {
      return originalConfigResolved.call(this, config);
    } finally {
      config.root = originalRoot;
    }
  };
  return plugin;
}

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [windowsSafeMcpPlugin()],
  },
});

