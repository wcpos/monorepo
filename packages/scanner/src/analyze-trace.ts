import { replayWedgeDetector, type TraceKey } from './wedge-detector';

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

/**
 * Analyze one completed keystroke trace from the settings test panel.
 *
 * The verdict, displayed code, and one-tap fixes all come from replaying the
 * real detector over the trace (`replayWedgeDetector` — the same reducer the
 * live hook streams through), so the panel can never claim a scan the detector
 * would reject, or vice versa.
 */
export function analyzeScanTrace(keys: TraceKey[], settings: ScanTraceSettings): TraceAnalysis {
	// Per-key gaps (including non-printable keys) purely for the timing chart.
	const gaps = keys.map((key, index) => (index === 0 ? 0 : key.timeMs - keys[index - 1].timeMs));

	const printable = keys.filter((entry) => entry.key.length === 1).map((entry) => entry.key);
	const raw = printable.join('');

	const detector = replayWedgeDetector(keys, settings);
	const { detectedAsScan, code } = detector;
	const avgGapMs = detector.minAvgGapMs;

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
	if (tooShort && code.length >= 1) {
		// Lower the minimum to the code's actual length so the detector accepts
		// it — clamping to a higher floor would leave the scan still rejected.
		const value = code.length;
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
