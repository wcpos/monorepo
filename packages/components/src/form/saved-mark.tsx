import * as React from 'react';

import Animated, { FadeOut, useReducedMotion, ZoomIn } from 'react-native-reanimated';

import { Icon } from '@wcpos/components/icon';
import { BEAT, EASE_BEAT } from '@wcpos/components/lib/motion';
import { Text } from '@wcpos/components/text';

/** A write landed (`saved`) or did not (`failed`: a falsy result, a refusal, a throw). */
type Outcome = 'saved' | 'failed';

const SavedFieldContext = React.createContext({
	name: '',
	at: 0,
	outcome: 'saved' as Outcome,
	markSaved: (_names: string[]) => {},
	markFailed: (_names: string[]) => {},
});

/** A saved acknowledgement holds this long, then fades; a failed one stays until the next write. */
const SAVED_HOLD_MS = 1200;

export function SavedFieldProvider({ children }: React.PropsWithChildren) {
	const [saved, setSaved] = React.useState({ name: '', at: 0, outcome: 'saved' as Outcome });
	const markSaved = React.useCallback((names: string[]) => {
		setSaved({ name: names[names.length - 1] ?? '', at: Date.now(), outcome: 'saved' });
	}, []);
	const markFailed = React.useCallback((names: string[]) => {
		setSaved({ name: names[names.length - 1] ?? '', at: Date.now(), outcome: 'failed' });
	}, []);
	// The timer owns the acknowledgement's hold and is cancelled when a newer write arrives. A
	// failure is not on a timer: the record does not hold the edit, so the mark stays until the
	// next write on any field replaces it (Paul, 2026-11-06: "If there is an error it should
	// have the error colour").
	React.useEffect(() => {
		if (!saved.name || saved.outcome === 'failed') return;
		const timer = setTimeout(() => setSaved({ name: '', at: 0, outcome: 'saved' }), SAVED_HOLD_MS);
		return () => clearTimeout(timer);
	}, [saved]);
	return (
		<SavedFieldContext.Provider value={{ ...saved, markSaved, markFailed }}>
			{children}
		</SavedFieldContext.Provider>
	);
}

/**
 * The keys in `changes` whose value differs from the record's. After a patch the form's reactive
 * `values` re-bind, and react-hook-form echoes a change event per field it normalises (a select's
 * key, a numeric input's number); those echoes run the change handler with the value the store
 * already holds, and marking them would move Saved to the wrong row. Compared as strings so a
 * formatting-only echo (2 vs "2") is not a change.
 */
export function savedKeys(before: object | undefined, changes: object): string[] {
	if (!before) return Object.keys(changes);
	const record = before as Record<string, unknown>;
	const next = changes as Record<string, unknown>;
	return Object.keys(next).filter((key) => String(record[key] ?? '') !== String(next[key] ?? ''));
}

export function useMarkSaved() {
	return React.useContext(SavedFieldContext).markSaved;
}

/** Marks a write that did not land: the same slot as Saved, in the error colour, held until the next write. */
export function useMarkFailed() {
	return React.useContext(SavedFieldContext).markFailed;
}

/** The name whose mark is showing ('' when none), saved or failed. */
export function useSavedName() {
	return React.useContext(SavedFieldContext).name;
}

/**
 * The acknowledgement of one field's write: a check in the success colour with `label`, or, when
 * the write did not land, an alert in the error colour with `failedLabel` (the icon alone where
 * the caller gives no words). The ink is the theme's success and error tokens (Paul, 2026-11-06).
 */
export function SavedMark({
	name,
	label,
	failedLabel,
}: {
	name: string;
	label: string;
	failedLabel?: string;
}) {
	const saved = React.useContext(SavedFieldContext);
	const reduced = useReducedMotion();
	if (saved.name !== name) return null;
	const failed = saved.outcome === 'failed';
	const ink = failed ? 'text-bad' : 'text-success';
	const words = failed ? failedLabel : label;
	return (
		<Animated.View
			testID={`${failed ? 'failed' : 'saved'}-${name}`}
			// The beat for a saved setting: the mark pops in with the shared overshoot.
			entering={reduced ? undefined : ZoomIn.duration(BEAT).easing(EASE_BEAT)}
			exiting={reduced ? undefined : FadeOut.duration(BEAT)}
			className="h-5 flex-row items-center gap-1"
		>
			<Icon name={failed ? 'alert' : 'check'} size="xs" className={ink} />
			{words ? (
				<Text numberOfLines={1} variant="help" className={ink}>
					{words}
				</Text>
			) : null}
		</Animated.View>
	);
}
