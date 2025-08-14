/**
 * Initial Props
 * - only web at the moment, but may be useful for other platforms in the future
 */
let initialProps: Record<string, unknown> = {};
if (globalThis.initialProps) {
	initialProps = Object.freeze(globalThis.initialProps); // prevent accidental mutation
}

export { initialProps };
