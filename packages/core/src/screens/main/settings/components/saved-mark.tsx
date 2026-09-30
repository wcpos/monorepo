import * as React from 'react';

import Animated, { FadeOut, useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@wcpos/components/icon';
import { BEAT } from '@wcpos/components/lib/motion';
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
			exiting={reduced ? undefined : FadeOut.duration(BEAT)}
			className="flex-row items-center gap-1"
		>
			<Icon name="check" size="xs" className="text-muted-foreground" />
			<Text className="text-muted-foreground text-xs">{label ?? t('settings.saved')}</Text>
		</Animated.View>
	);
}
