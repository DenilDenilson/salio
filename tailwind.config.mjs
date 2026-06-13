/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        panel: "#f8fafc",
        line: "#d7dee8",
        success: "#0f7b45",
        danger: "#b42318",
        warning: "#986f00",
        neutral: "#5b6675",
        accent: "#0f6f8f",
      },
    },
  },
  plugins: [],
};
