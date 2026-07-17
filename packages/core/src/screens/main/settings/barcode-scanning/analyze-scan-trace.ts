export interface TraceKey {
	key: string;
	timeMs: number;
}

export interface ScanTraceSettings {
	threshold: number;
	minChars: number;
	prefix: string;
	suffix: string;
}

export interface TraceSuggestion {
	kind: 'raise-threshold' | 'lower-min-chars' | 'set-prefix';
	patch: Record<string, number | string>;
	value: number | string;
}

export interface TraceAnalysis {
	raw: string;
	code: string;
	avgGapMs: number;
	gaps: number[];
	detectedAsScan: boolean;
	tooShort: boolean;
	nearMiss: boolean;
	leadingSymbol: string | null;
	trailingEnter: boolean;
	shiftMangled: boolean;
	suggestions: TraceSuggestion[];
}

// A trace slower than this is a person typing, not a mis-tuned scanner —
// no threshold suggestion is worth making beyond it.
const SCANNER_FAST_CEILING_MS = 60;
const THRESHOLD_HEADROOM_MS = 8;
const MIN_CHARS_FLOOR = 3;

/**
 * Analyze one completed keystroke trace from the settings test panel.
 *
 * The live detection hook uses a running average over the keystroke stream;
 * for a completed trace a simple mean of the gaps is a close and far more
 * explainable approximation, so verdicts can say "average gap {n}ms".
 */
export function analyzeScanTrace(keys: TraceKey[], settings: ScanTraceSettings): TraceAnalysis {
	const gaps = keys.map((key, index) => (index === 0 ? 0 : key.timeMs - keys[index - 1].timeMs));
	const interKeyGaps = gaps.slice(1);
	const avgGapMs =
		interKeyGaps.length > 0
			? interKeyGaps.reduce((sum, gap) => sum + gap, 0) / interKeyGaps.length
			: Number.POSITIVE_INFINITY;

	const printable = keys.filter((entry) => entry.key.length === 1).map((entry) => entry.key);
	const raw = printable.join('');

	let code = raw;
	if (settings.prefix && code.startsWith(settings.prefix)) {
		code = code.slice(settings.prefix.length);
	}
	if (settings.suffix && code.endsWith(settings.suffix)) {
		code = code.slice(0, code.length - settings.suffix.length);
	}

	const detectedAsScan = avgGapMs < settings.threshold;
	const tooShort = detectedAsScan && code.length < settings.minChars;
	const nearMiss = !detectedAsScan && avgGapMs < SCANNER_FAST_CEILING_MS;
	const leadingSymbol = /^[^0-9A-Za-z]/.test(raw) ? raw[0] : null;
	const lastKey = keys[keys.length - 1]?.key;
	const trailingEnter = lastKey === 'Enter' || lastKey === 'Return';
	const shiftMangled = keys.filter((entry) => entry.key === 'Shift').length >= 2;

	const suggestions: TraceSuggestion[] = [];
	if (nearMiss) {
		const value = Math.ceil(avgGapMs + THRESHOLD_HEADROOM_MS);
		suggestions.push({
			kind: 'raise-threshold',
			value,
			patch: { barcode_scanning_avg_time_input_threshold: value },
		});
	}
	if (tooShort) {
		const value = Math.max(MIN_CHARS_FLOOR, code.length);
		suggestions.push({
			kind: 'lower-min-chars',
			value,
			patch: { barcode_scanning_min_chars: value },
		});
	}
	if (detectedAsScan && leadingSymbol && settings.prefix === '') {
		suggestions.push({
			kind: 'set-prefix',
			value: leadingSymbol,
			patch: { barcode_scanning_prefix: leadingSymbol },
		});
	}

	return {
		raw,
		code,
		avgGapMs,
		gaps,
		detectedAsScan,
		tooShort,
		nearMiss,
		leadingSymbol,
		trailingEnter,
		shiftMangled,
		suggestions,
	};
}
