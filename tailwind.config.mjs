/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        ink: "#eef6ff",
        panel: "#111823",
        line: "#273342",
        success: "#39f08f",
        danger: "#ff4d6d",
        warning: "#ffd166",
        neutral: "#9eacbc",
        accent: "#34d6ff",
      },
    },
  },
  plugins: [],
};
