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
