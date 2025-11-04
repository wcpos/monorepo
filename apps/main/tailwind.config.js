/**
 * Tailwind CSS v4 Configuration for NativeWind v5
 *
 * Uses modern oklch color format for better color handling and opacity support.
 * Colors are defined in global.css with oklch() wrapper and referenced here directly.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
	corePlugins: {
		// ESSENTIAL: Must be enabled for opacity modifiers to work with custom colors
		backgroundOpacity: true,
	},
	darkMode: ['class'],
	content: [
		'./app/**/*.{js,jsx,ts,tsx}',
		'../../packages/components/src/**/*.{ts,tsx}',
		'../../packages/core/src/**/*.{ts,tsx}',
	],
	// presets: [require('nativewind/preset')], // Not available in NativeWind v5
	prefix: '',
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px',
			},
		},
		extend: {
			width: {
				128: '32rem',
				144: '36rem',
				160: '40rem',
			},
			fontSize: {
				// Native uses default rem=14px, Web scales down by 87.5%
				xs: ['0.875rem', '1.143'],
				sm: ['0.9375rem', '1.25'],
				base: ['1rem', '1.5'],
				lg: ['1.125rem', '1.556'],
				xl: ['1.25rem', '1.4'],
				'2xl': ['1.5rem', '1.333'],
				'3xl': ['1.875rem', '1.2'],
				'4xl': ['2.25rem', '1.111'],
				'5xl': ['3rem', '1.083'],
			},
			colors: {
				border: 'var(--border)',
				input: 'var(--input)',
				ring: 'var(--ring)',
				background: 'var(--background)',
				foreground: 'var(--foreground)',
				primary: {
					DEFAULT: 'var(--primary)',
					foreground: 'var(--primary-foreground)',
				},
				secondary: {
					DEFAULT: 'var(--secondary)',
					foreground: 'var(--secondary-foreground)',
				},
				tertiary: {
					DEFAULT: 'var(--tertiary)',
					foreground: 'var(--tertiary-foreground)',
				},
				destructive: {
					DEFAULT: 'var(--destructive)',
					foreground: 'var(--destructive-foreground)',
				},
				success: {
					DEFAULT: 'var(--success)',
					foreground: 'var(--success-foreground)',
				},
				warning: {
					DEFAULT: 'var(--warning)',
					foreground: 'var(--warning-foreground)',
				},
				attention: {
					DEFAULT: 'var(--attention)',
					foreground: 'var(--attention-foreground)',
				},
				info: {
					DEFAULT: 'var(--info)',
					foreground: 'var(--info-foreground)',
				},
				error: {
					DEFAULT: 'var(--error)',
					foreground: 'var(--error-foreground)',
				},
				muted: {
					DEFAULT: 'var(--muted)',
					foreground: 'var(--muted-foreground)',
				},
				accent: {
					DEFAULT: 'var(--accent)',
					foreground: 'var(--accent-foreground)',
				},
				popover: {
					DEFAULT: 'var(--popover)',
					foreground: 'var(--popover-foreground)',
				},
				card: {
					DEFAULT: 'var(--card)',
					foreground: 'var(--card-foreground)',
				},
			},
			borderWidth: {
				hairline: 'var(--hairline-width)',
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' },
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' },
				},
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
			},
		},
	},
	plugins: [require('tailwindcss-animate')],
};
