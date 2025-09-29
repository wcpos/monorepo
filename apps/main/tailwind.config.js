/**
 * Tailwind CSS v4 Configuration for NativeWind v5
 *
 * Platform-specific values are defined as CSS variables in global.css
 * using @media queries (ios, android, web). This approach avoids the
 * need to import react-native modules in the config file.
 *
 * @see https://github.com/nativewind/nativewind/pull/1346
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
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
				'3xs': ['var(--font-3xs)', 'var(--font-3xs-height)'],
				'2xs': ['var(--font-2xs)', 'var(--font-2xs-height)'],
				xs: ['var(--font-xs)', 'var(--font-xs-height)'],
				sm: ['var(--font-sm)', 'var(--font-sm-height)'],
				base: ['var(--font-base)', 'var(--font-base-height)'],
				lg: ['var(--font-lg)', 'var(--font-lg-height)'],
				xl: ['var(--font-xl)', 'var(--font-xl-height)'],
				'2xl': ['var(--font-2xl)', 'var(--font-2xl-height)'],
				'3xl': ['var(--font-3xl)', 'var(--font-3xl-height)'],
				'4xl': ['var(--font-4xl)', 'var(--font-4xl-height)'],
				'5xl': ['var(--font-5xl)', 'var(--font-5xl-height)'],
				'6xl': ['var(--font-6xl)', '1'],
				'7xl': ['var(--font-7xl)', '1'],
				'8xl': ['var(--font-8xl)', '1'],
				'9xl': ['var(--font-9xl)', '1'],
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))',
				},
				tertiary: {
					DEFAULT: 'hsl(var(--tertiary))',
					foreground: 'hsl(var(--tertiary-foreground))',
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))',
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))',
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))',
				},
				attention: {
					DEFAULT: 'hsl(var(--attention))',
					foreground: 'hsl(var(--attention-foreground))',
				},
				info: {
					DEFAULT: 'hsl(var(--info))',
					foreground: 'hsl(var(--info-foreground))',
				},
				error: {
					DEFAULT: 'hsl(var(--error))',
					foreground: 'hsl(var(--error-foreground))',
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))',
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))',
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))',
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))',
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
