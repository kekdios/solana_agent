/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/index.html", "./src/renderer/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        discord: {
          dark: "#313338",
          darker: "#2b2d31",
          darkest: "#1e1f22",
          panel: "#2b2d31",
          input: "#383a40",
        },
      },
    },
  },
  plugins: [],
};
