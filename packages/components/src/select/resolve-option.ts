import type { Option } from './types';

/**
 * Resolve the option a Select emitted back to the caller's canonical entry.
 *
 * On web, `@rn-primitives/select` reports a selection as `{ value: val, label: val }`
 * (see its `select.web.js`) — the label mirrors the raw value rather than carrying
 * the option's label. Native reports the option itself. Callers read the second
 * `onChange` argument expecting the entry they passed in, so the emitted object is
 * matched back against `options` rather than forwarded as-is; otherwise selecting
 * "Standard" hands the caller a label of `"standard"` on web only.
 *
 * Falls back to the emitted object when nothing matches, so a value outside
 * `options` still reaches the caller instead of becoming `undefined`.
 */
export function resolveOption(
	options: readonly Option[],
	emitted: Option | undefined
): Option | undefined {
	if (!emitted) {
		return undefined;
	}
	return options.find((candidate) => candidate.value === emitted.value) ?? emitted;
}
