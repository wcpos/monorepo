/**
 * One canonical unknown -> human message extraction.
 * Replaces the `error instanceof Error ? error.message : String(error)`
 * ternary that was copy-pasted 40+ times across packages/core.
 */
export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
