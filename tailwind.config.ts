import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fdf4ff",
          100: "#fae8ff",
          500: "#a855f7",
          600: "#9333ea",
          700: "#7e22ce",
          900: "#581c87",
        },
      },
    },
  },
  plugins: [
    plugin(({ addVariant }) => {
      /**
       * `can-hover:` — only devices with a real pointer.
       *
       * Controls that appear on hover are invisible on a phone, because there is no
       * hover. Anything hidden behind `group-hover` must be visible by default and
       * hidden with `can-hover:` instead, so touch users can actually see it.
       */
      addVariant("can-hover", "@media (hover: hover) and (pointer: fine)");
    }),
  ],
};
export default config;
