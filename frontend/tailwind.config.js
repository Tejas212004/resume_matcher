/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // ✅ This line enables the manual dark mode toggle
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      colors: {
        primary: '#2563eb', // bright blue
        secondary: '#4f46e5', // indigo
        accent: '#22c55e', // green
        light: '#f9fafb', // background gray-white
        dark: '#1e293b', // dark gray
      },
      boxShadow: {
        soft: '0 4px 20px rgba(0, 0, 0, 0.05)',
        glow: '0 0 15px rgba(37, 99, 235, 0.4)',
      },
      container: {
        center: true,
        padding: '1rem',
      },
    },
  },
  plugins: [],
};