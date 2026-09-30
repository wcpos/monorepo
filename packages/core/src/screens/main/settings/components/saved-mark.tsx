import * as React from 'react';

import Animated, { FadeOut, useReducedMotion } from 'react-native-reanimated';

import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { BEAT } from '@wcpos/components/lib/motion';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';

/** How long the mark holds beside the control before it fades (S2). */
export const SAVED_HOLD_MS = 1200;

type Saved = { names: readonly string[]; at: number } | null;

// Two contexts: `markSaved` is stable, so a page that only reports a write (the theme
// tiles, whose re-render would cancel Uniwind's transition) never re-renders on a mark.
const SavedFieldContext = React.createContext<Saved>(null);
const MarkSavedContext = React.createContext<(names: string | readonly string[]) => void>(() => {});

export function SavedFieldProvider({ children }: { children: React.ReactNode }) {
	const [saved, setSaved] = React.useState<Saved>(null);
	const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const markSaved = React.useCallback((names: string | readonly string[]) => {
		const list = typeof names === 'string' ? [names] : names;
		if (list.length === 0) return;
		clearTimeout(timer.current);
		setSaved({ names: list, at: Date.now() });
		timer.current = setTimeout(() => setSaved(null), SAVED_HOLD_MS);
	}, []);
	return (
		<MarkSavedContext.Provider value={markSaved}>
			<SavedFieldContext.Provider value={saved}>{children}</SavedFieldContext.Provider>
		</MarkSavedContext.Provider>
	);
}

export function useMarkSaved() {
	return React.useContext(MarkSavedContext);
}

/**
 * A check and **Saved** beside the control that just wrote, for 1.2 s, then an
 * opacity fade on the motion contract's beat; under reduce-motion it simply goes.
 */
export function SavedMark({ name, label }: { name: string; label?: string }) {
	const saved = React.useContext(SavedFieldContext);
	const reduced = useReducedMotion();
	const t = useT();
	if (!saved?.names.includes(name)) return null;
	return (
		<Animated.View key={saved.at} exiting={reduced ? undefined : FadeOut.duration(BEAT)}>
			<HStack testID={`settings-saved-${name}`} className="items-center gap-1">
				<Icon name="check" size="xs" className="text-muted-foreground" />
				<Text className="text-muted-foreground text-xs">{label ?? t('settings.saved')}</Text>
			</HStack>
		</Animated.View>
	);
}
