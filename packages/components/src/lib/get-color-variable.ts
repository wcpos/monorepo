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

	// Find all text-* classes (excluding text-xs, text-sm, text-base, text-lg, etc.)
	const sizeClasses = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'];
	const textColorClasses = classes.filter((cls) => {
		if (!cls.startsWith('text-')) return false;
		// Ignore platform prefixes like native:text-*, web:text-*, etc.
		if (cls.includes(':')) return false;
		// Ignore size classes
		const colorPart = cls.replace('text-', '');
		return !sizeClasses.includes(colorPart);
	});

	if (textColorClasses.length === 0) return null;

	// Use the last text color class (later classes override earlier ones)
	const lastTextClass = textColorClasses[textColorClasses.length - 1];
	const colorName = lastTextClass.replace('text-', '');

	return `--color-${colorName}`;
}
