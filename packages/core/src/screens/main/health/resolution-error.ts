/**
 * Why a Store health resolution (Send again / Discard) threw. The engine throws
 * plain Errors (`write-path/conflict-resolution.ts`), so the message is the only
 * signal:
 * - `already-resolved`: the row was settled already — by auto-recovery, another tab,
 *   or a double tap. Nothing is wrong and nothing is left to do.
 * - `held-elsewhere`: another window holds the claim and is resolving it right now.
 * - `failed`: anything else, a real failure.
 */
export type ResolutionErrorKind = 'already-resolved' | 'held-elsewhere' | 'failed';

export function classifyResolutionError(error: unknown): ResolutionErrorKind {
	const message = error instanceof Error ? error.message : String(error);
	if (/terminal mutation ".*" not found/.test(message)) return 'already-resolved';
	if (/another window is resolving/.test(message)) return 'held-elsewhere';
	return 'failed';
}
