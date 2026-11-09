import tailwindcssAnimate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
	darkMode: ["class"],
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				// Wordmark only — see the @font-face in index.css.
				wordmark: ["Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
			},
			colors: {
				border: "hsl(var(--border))",
				input: "hsl(var(--input))",
				ring: "hsl(var(--ring))",
				background: "hsl(var(--background))",
				foreground: "hsl(var(--foreground))",
				primary: {
					DEFAULT: "hsl(var(--primary))",
					foreground: "hsl(var(--primary-foreground))",
				},
				secondary: {
					DEFAULT: "hsl(var(--secondary))",
					foreground: "hsl(var(--secondary-foreground))",
				},
				destructive: {
					DEFAULT: "hsl(var(--destructive))",
					foreground: "hsl(var(--destructive-foreground))",
				},
				muted: {
					DEFAULT: "hsl(var(--muted))",
					foreground: "hsl(var(--muted-foreground))",
				},
				accent: {
					DEFAULT: "hsl(var(--accent))",
					foreground: "hsl(var(--accent-foreground))",
				},
				popover: {
					DEFAULT: "hsl(var(--popover))",
					foreground: "hsl(var(--popover-foreground))",
				},
				card: {
					DEFAULT: "hsl(var(--card))",
					foreground: "hsl(var(--card-foreground))",
				},
				nav: {
					DEFAULT: "hsl(var(--nav))",
					edge: "hsl(var(--nav-edge))",
					bright: "hsl(var(--nav-bright))",
				},
			},
			transitionTimingFunction: {
				// Named rather than written at the call site as
				// `ease-[cubic-bezier(…)]`: tailwindcss-animate claims the same
				// `ease-` prefix for `animation-timing-function`, which makes any
				// *arbitrary* value under it ambiguous — Tailwind warns and emits
				// nothing, so the class silently does nothing. A named key is fine;
				// both plugins simply take it.
				swift: "cubic-bezier(0.22, 0.7, 0.2, 1)",
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
			},
			keyframes: {
				"accordion-down": {
					from: { height: "0" },
					to: { height: "var(--radix-accordion-content-height)" },
				},
				"accordion-up": {
					from: { height: "var(--radix-accordion-content-height)" },
					to: { height: "0" },
				},
				// One full low→high→low stroke. The bars of NowPlayingBars all run
				// it at the same duration, staggered a quarter cycle apart via
				// negative delays, so together they form a traveling wave that
				// repeats exactly once per cycle.
				equalize: {
					"0%, 100%": { transform: "scaleY(0.3)" },
					"50%": { transform: "scaleY(1)" },
				},
			},
			animation: {
				"accordion-down": "accordion-down 0.2s ease-out",
				"accordion-up": "accordion-up 0.2s ease-out",
				equalize: "equalize 1.2s ease-in-out infinite",
			},
		},
	},
	plugins: [tailwindcssAnimate],
};
