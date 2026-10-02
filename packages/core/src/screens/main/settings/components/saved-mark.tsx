import * as React from 'react';

import Animated, { FadeOut, useReducedMotion, ZoomIn } from 'react-native-reanimated';

import { Icon } from '@wcpos/components/icon';
import { BEAT, EASE_BEAT } from '@wcpos/components/lib/motion';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';

const SavedFieldContext = React.createContext({
	name: '',
	at: 0,
	markSaved: (_names: string[]) => {},
});

export function SavedFieldProvider({ children }: React.PropsWithChildren) {
	const [saved, setSaved] = React.useState({ name: '', at: 0 });
	const markSaved = React.useCallback((names: string[]) => {
		setSaved({ name: names[names.length - 1] ?? '', at: Date.now() });
	}, []);
	// The timer owns the acknowledgement's hold and is cancelled when a newer write arrives.
	React.useEffect(() => {
		if (!saved.name) return;
		const timer = setTimeout(() => setSaved({ name: '', at: 0 }), 1200);
		return () => clearTimeout(timer);
	}, [saved]);
	return (
		<SavedFieldContext.Provider value={{ ...saved, markSaved }}>
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

export function SavedMark({ name, label }: { name: string; label?: string }) {
	const saved = React.useContext(SavedFieldContext);
	const reduced = useReducedMotion();
	const t = useT();
	if (saved.name !== name) return null;
	return (
		<Animated.View
			testID={`settings-saved-${name}`}
			// The beat for a saved setting: the mark pops in with the shared overshoot.
			entering={reduced ? undefined : ZoomIn.duration(BEAT).easing(EASE_BEAT)}
			exiting={reduced ? undefined : FadeOut.duration(BEAT)}
			className="flex-row items-center gap-1"
		>
			<Icon name="check" size="xs" className="text-muted-foreground" />
			<Text numberOfLines={1} className="text-muted-foreground text-xs">
				{label ?? t('settings.saved')}
			</Text>
		</Animated.View>
	);
}
