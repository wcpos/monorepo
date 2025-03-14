const { hairlineWidth } = require('nativewind/theme');

/**
 * https://github.com/nativewind/nativewind/pull/1346
 */
const isWeb = process.env.NATIVEWIND_OS === 'web';

/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ['class'],
	content: [
		'./app/**/*.{js,jsx,ts,tsx}',
		'../../packages/components/src/**/*.{ts,tsx}',
		'../../packages/core/src/**/*.{ts,tsx}',
	],
	presets: [require('nativewind/preset')],
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
				'3xs': isWeb
					? ['0.625rem', { lineHeight: '0.75rem' }] // 10px / 12px
					: [11, 0.929], // 11px / 13px
				'2xs': isWeb
					? ['0.6875rem', { lineHeight: '0.8125rem' }] // 11px / 13px
					: [12, 1], // 12px / 14px
				xs: isWeb
					? ['0.75rem', { lineHeight: '0.875rem' }] // 12px / 14px
					: [13, 1.071], // 13px / 15px
				sm: isWeb
					? ['0.8125rem', { lineHeight: '0.9375rem' }] // 13px / 15px
					: [14, 1.143], // 14px / 16px
				base: isWeb
					? ['0.875rem', '1rem'] // 14px / 16px
					: [16, 1.429], // 16px / 20px
				lg: isWeb
					? ['1rem', { lineHeight: '1.25rem' }] // 16px / 20px
					: [18, 1.714], // 18px / 24px
				xl: isWeb
					? ['1.125rem', { lineHeight: '1.5rem' }] // 18px / 24px
					: [20, 2], // 20px / 28px
				'2xl': isWeb
					? ['1.25rem', { lineHeight: '1.75rem' }] // 20px / 28px
					: [24, 2], // 20px / 28px
				'3xl': isWeb
					? ['1.5rem', { lineHeight: '2rem' }] // 24px / 32px
					: [30, 1],
				'4xl': isWeb
					? ['1.875rem', { lineHeight: '2.25rem' }] // 30px / 36px
					: [36, 1],
				'5xl': isWeb
					? ['2.25rem', { lineHeight: '2.5rem' }] // 36px / 40px
					: [48, 1],
				'6xl': isWeb
					? ['3rem', { lineHeight: '1' }] // 48px
					: [60, 1],
				'7xl': isWeb
					? ['3.75rem', { lineHeight: '1' }] // 60px
					: [72, 1],
				'8xl': isWeb
					? ['4.5rem', { lineHeight: '1' }] // 72px
					: [96, 1],
				'9xl': isWeb
					? ['6rem', { lineHeight: '1' }] // 96px
					: [120, 1],
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
				hairline: hairlineWidth(),
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
