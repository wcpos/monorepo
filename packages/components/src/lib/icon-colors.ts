import Color from 'color';

const variantToHSL: Record<string, string> = {
	default: 'hsl(210.66 39.5% 23.3%)', // Default foreground color
	primary: 'hsl(202.36 82.8% 41%)',
	destructive: 'hsl(356 75% 53%)',
	secondary: 'hsl(210 21.6% 49%)',
	muted: 'hsl(209 28% 39%)',
	success: 'hsl(166 72% 28%)',
	error: 'hsl(356 75% 53%)',
	warning: 'hsl(20 80% 55%)',
	info: 'hsl(207 90% 54%)',
	'accent-foreground': 'hsl(222.2 47.4% 11.2%)',
	attention: 'hsl(50 100% 80%)',
	foreground: 'hsl(210.66 39.5% 23.3%)',
	'primary-foreground': 'hsl(210 40% 98%)',
	'destructive-foreground': 'hsl(210 40% 98%)',
	'secondary-foreground': 'hsl(210 40% 98%)',
	'muted-foreground': 'hsl(209 28% 39%)',
	'success-foreground': 'hsl(166 72% 28%)',
	'tertiary-foreground': 'hsl(210 40% 98%)',
	'error-foreground': 'hsl(356 75% 53%)',
};

/**
 * Extracts the first `text-*` class from a className string and resolves its color.
 */
export const getResolvedColor = (variant?: string, className?: string): string => {
	// 1. Use explicit variant if available.
	if (variant && variantToHSL[variant]) {
		return Color(variantToHSL[variant]).rgb().string();
	}

	if (className) {
		// Split className by whitespace.
		const classes = className.split(/\s+/);

		// 2. Look for native-prefixed text classes.
		const nativeTextClasses = classes
			.filter((cls) => cls.startsWith('native:text-'))
			.map((cls) => cls.replace('native:text-', ''))
			.filter((key) => variantToHSL[key]); // Only keep those that map to a colour

		if (nativeTextClasses.length > 0) {
			const lastNative = nativeTextClasses[nativeTextClasses.length - 1];
			return Color(variantToHSL[lastNative]).rgb().string();
		}

		// 3. Look for non-prefixed text classes (ignore classes with a colon).
		const textClasses = classes
			.filter((cls) => cls.startsWith('text-') && !cls.includes(':'))
			.map((cls) => cls.replace('text-', ''))
			.filter((key) => variantToHSL[key]); // Only keep valid keys

		if (textClasses.length > 0) {
			const lastText = textClasses[textClasses.length - 1];
			return Color(variantToHSL[lastText]).rgb().string();
		}
	}

	// 4. Fallback to default colour.
	return Color(variantToHSL.default).rgb().string();
};
