import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  site: "https://www.jydream.ca",
  adapter: node({
    mode: "standalone"
  }),
  integrations: [mdx(), sitemap(), icon()],
  vite: {
    plugins: [tailwindcss()],
  },
});
