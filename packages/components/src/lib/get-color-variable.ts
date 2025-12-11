/**
 * Extract CSS variable from className string by finding the last text-* class.
 * This allows textClass context (e.g., from Button) to override the variant's default color.
 *
 * Examples:
 * - "text-primary" → "--color-primary"
 * - "text-primary-foreground" → "--color-primary-foreground"
 * - "text-muted-foreground" → "--color-muted-foreground"
 */
export function getColorVariableFromClassName(className?: string): string | null {
	if (!className) return null;

	const classes = className.split(/\s+/);

	// Exact text-* utility classes that are NOT colors
	const nonColorClasses = new Set([
		// Size classes
		'xs',
		'sm',
		'base',
		'lg',
		'xl',
		'2xl',
		'3xl',
		'4xl',
		'5xl',
		'6xl',
		'7xl',
		'8xl',
		'9xl',
		// Alignment classes
		'left',
		'center',
		'right',
		'justify',
		'start',
		'end',
		// Wrapping/overflow classes
		'wrap',
		'nowrap',
		'balance',
		'pretty',
		'clip',
		'ellipsis',
		'truncate',
	]);

	// Prefixes for text-* utilities that are NOT colors (e.g., text-shadow-*, text-opacity-*)
	const nonColorPrefixes = ['shadow', 'opacity'];

	const textColorClasses = classes.filter((cls) => {
		if (!cls.startsWith('text-')) return false;
		// Ignore platform/state prefixes like native:text-*, web:text-*, hover:text-*, etc.
		if (cls.includes(':')) return false;

		const valuePart = cls.slice(5); // Remove 'text-' prefix

		// Ignore arbitrary values like text-[14px], text-[#fff], text-[var(--x)]
		if (valuePart.startsWith('[')) return false;

		// Ignore exact non-color utility classes
		if (nonColorClasses.has(valuePart)) return false;

		// Ignore prefix-based non-color utilities (text-shadow-*, text-opacity-*)
		for (const prefix of nonColorPrefixes) {
			if (valuePart === prefix || valuePart.startsWith(`${prefix}-`)) return false;
		}

		return true;
	});

	if (textColorClasses.length === 0) return null;

	// Use the last text color class (later classes override earlier ones)
	const lastTextClass = textColorClasses[textColorClasses.length - 1];
	const colorName = lastTextClass.slice(5); // Remove 'text-' prefix

	return `--color-${colorName}`;
}
