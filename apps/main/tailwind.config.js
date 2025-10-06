/**
 * Tailwind CSS v4 Configuration for NativeWind v5
 *
 * This version uses the modern oklch color format for better color handling
 * and opacity support. The oklch format provides better perceptual uniformity
 * and wider color gamut compared to HSL.
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
				xs: ['0.75rem', '1.167'], // Native: 10.5px, Web: 10.5px
				sm: ['0.875rem', '1.143'], // Native: 12.25px, Web: 12.25px
				base: ['1rem', '1.5'], // Native: 16px, Web: 14px (using unitless for direct px on native)
				lg: ['1.125rem', '1.556'], // Native: 15.75px, Web: 15.75px
				xl: ['1.25rem', '1.4'], // Native: 17.5px, Web: 17.5px
				'2xl': ['1.5rem', '1.333'], // Native: 21px, Web: 21px
				'3xl': ['1.875rem', '1.2'], // Native: 26.25px, Web: 26.25px
				'4xl': ['2.25rem', '1.111'], // Native: 31.5px, Web: 31.5px
				'5xl': ['3rem', '1.083'], // Native: 42px, Web: 42px
			},
			colors: {
				// Semantic color mappings for backward compatibility
				// These reference the CSS variables which now map to standard Tailwind colors
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
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
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
