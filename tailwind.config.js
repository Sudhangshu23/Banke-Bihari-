module.exports = {
    darkMode: "class",
  content: ["./public/index.html"],
  plugins: [require("@tailwindcss/forms"),require("@tailwindcss/container-queries")],
    theme: {
      extend: {
        "colors": {
          "canvas-ivory": "#E8DDCA",
          "border-beige": "#C1B4A4",
          "caramel-accent": "#A87850",
          "coffee-brown": "#70452F",
          "surface-card": "#F8F4EC",
          "espresso-deep": "#39271F",
          "primary": "#A87850",
          "primary-container": "#8b5f3a",
          "on-primary": "#ffffff",
          "background": "#E8DDCA",
          "surface": "#F8F4EC",
          "on-surface": "#39271F",
          "on-surface-variant": "#5a453b",
          "outline": "#C1B4A4"
        },
        "borderRadius": {
          "DEFAULT": "0.25rem",
          "lg": "0.375rem",
          "xl": "0.5rem",
          "full": "9999px"
        },
        "spacing": {
          "space-xs": "0.25rem",
          "space-sm": "0.5rem",
          "space-md": "1rem",
          "space-lg": "1.75rem",
          "space-xl": "3rem",
          "gutter": "1.5rem",
          "gutter-mobile": "1rem",
          "margin": "3rem",
          "margin-mobile": "1.25rem"
        },
        "fontFamily": {
          "display-hero": ["Playfair Display", "serif"],
          "headline-lg": ["Playfair Display", "serif"],
          "headline-md": ["Playfair Display", "serif"],
          "headline-sm": ["Playfair Display", "serif"],
          "subheading": ["Playfair Display", "serif"],
          "body-lg": ["DM Sans", "sans-serif"],
          "body-md": ["DM Sans", "sans-serif"],
          "body-sm": ["DM Sans", "sans-serif"],
          "label-button": ["Outfit", "sans-serif"],
          "label-navigation": ["Outfit", "sans-serif"],
          "badge-caps": ["Outfit", "sans-serif"],
          "logo": ["Space Grotesk", "sans-serif"]
        }
      },
    },
  };
