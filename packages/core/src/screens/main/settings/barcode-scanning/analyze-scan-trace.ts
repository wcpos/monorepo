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

interface DetectorResult {
	/** Whether the production detector would latch onto this trace as a scan. */
	detectedAsScan: boolean;
	/** The barcode the production detector would emit (prefix/suffix stripped). */
	code: string;
	/**
	 * The lowest running-average gap the detector reached over the trace — this
	 * is the value it actually compares against the threshold to latch, so it is
	 * also the value a "raise the threshold" suggestion has to clear.
	 */
	minAvgGapMs: number;
}

/**
 * Replay the production detector (`useBarcodeDetection`) over a completed trace.
 *
 * The panel must agree with what the detector actually does, not an independent
 * approximation, otherwise its verdict, displayed code, and one-tap fixes can
 * contradict the real scan. So this mirrors the detector exactly:
 *   - only printable (length-1) keys advance timing and the input stack;
 *   - the average folds each gap in as `(avg + gap) / 2` (starting from the
 *     first gap), rather than a whole-trace arithmetic mean;
 *   - scanning latches the first time that folded average drops below the
 *     threshold and stays latched for the rest of the burst;
 *   - a configured prefix/suffix is compared against only the first/last key of
 *     the stack (a single key), not stripped as a substring.
 */
function replayDetector(keys: TraceKey[], settings: ScanTraceSettings): DetectorResult {
	let avg = 0;
	let detecting = false;
	let stack: string[] = [];
	let lastTimeMs: number | null = null;
	let minAvgGapMs = Number.POSITIVE_INFINITY;

	for (const entry of keys) {
		// The detector ignores non-printable keys before touching any timing state.
		if (entry.key.length !== 1) {
			continue;
		}

		let gap = Number.POSITIVE_INFINITY;
		if (lastTimeMs !== null) {
			gap = entry.timeMs - lastTimeMs;
		}
		avg = avg === 0 ? gap : (avg + gap) / 2;
		if (Number.isFinite(avg)) {
			minAvgGapMs = Math.min(minAvgGapMs, avg);
		}

		if (detecting || avg < settings.threshold) {
			detecting = true;
			stack.push(entry.key);
		} else {
			avg = 0;
			stack = [entry.key];
		}

		lastTimeMs = entry.timeMs;
	}

	if (!detecting) {
		return { detectedAsScan: false, code: '', minAvgGapMs };
	}

	// Mirror the detector's boundary strip: it removes the prefix/suffix only
	// when it equals the single key at the edge of the stack.
	const inputStack = [...stack];
	if (settings.prefix && inputStack[0] === settings.prefix) {
		inputStack.shift();
	}
	if (settings.suffix && inputStack[inputStack.length - 1] === settings.suffix) {
		inputStack.pop();
	}

	return { detectedAsScan: true, code: inputStack.join(''), minAvgGapMs };
}

/**
 * Analyze one completed keystroke trace from the settings test panel.
 *
 * The verdict, displayed code, and one-tap fixes all come from replaying the
 * real detector over the trace (see `replayDetector`), so the panel can never
 * claim a scan the detector would reject — or vice versa.
 */
export function analyzeScanTrace(keys: TraceKey[], settings: ScanTraceSettings): TraceAnalysis {
	// Per-key gaps (including non-printable keys) purely for the timing chart.
	const gaps = keys.map((key, index) => (index === 0 ? 0 : key.timeMs - keys[index - 1].timeMs));

	const printable = keys.filter((entry) => entry.key.length === 1).map((entry) => entry.key);
	const raw = printable.join('');

	const detector = replayDetector(keys, settings);
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
