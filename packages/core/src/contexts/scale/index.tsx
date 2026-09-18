import * as React from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { ScopedVariables } from 'uniwind';

import { usePointer } from '@wcpos/components/lib/device';
import { resolveStep, scaleVariables, type ScaleVariables } from '@wcpos/components/lib/scale';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../app-state';

/**
 * Web only: mirror the seven scale tokens onto the document root.
 *
 * Uniwind's web `ScopedVariables` is a `display: contents` div carrying the
 * variables as inline custom properties, so anything portalled to
 * `document.body` — select and combobox content, dialogs, the toaster — leaves
 * the subtree and would render at the sheet's Regular defaults. Writing the same
 * values onto `documentElement` puts the step above every portal. Native needs
 * nothing: there the Uniwind context IS the mechanism.
 *
 * External mutation belongs in a pre-paint effect, and only the seven names this
 * provider owns are removed on unmount.
 */
function useRootScaleMirror(variables: ScaleVariables): void {
	React.useLayoutEffect(() => {
		if (Platform.OS !== 'web' || typeof document === 'undefined') return;
		const root = document.documentElement.style;
		const names = Object.keys(variables) as (keyof ScaleVariables)[];
		names.forEach((name) => root.setProperty(name, `${variables[name]}px`));
		return () => names.forEach((name) => root.removeProperty(name));
	}, [variables]);
}

/**
 * Carries the density step to every screen, from the store's Scale override or
 * from Auto-by-extent, with the pointer floor applied.
 *
 * Mounted inside `HydrationProviders` around both the stack and the toaster, so
 * every `PortalHost` sits inside it. No store means Auto, so the auth screens
 * scale too.
 */
export function ScaleProvider({ children }: { children: React.ReactNode }) {
	const { store } = useAppState();
	const scale = useDocField(store, (latest) => latest.scale);
	const { width, height } = useWindowDimensions();
	const pointer = usePointer();

	// Turning a phone must not reflow the register, so Auto reads the shortest
	// side on native. A web window is resized, not rotated: there the width is
	// what the merchant changed and what the step should follow.
	const extent = Platform.OS === 'web' ? width : Math.min(width, height);
	const step = resolveStep(scale, extent);
	const variables = React.useMemo(() => scaleVariables(step, pointer), [step, pointer]);

	useRootScaleMirror(variables);

	return <ScopedVariables variables={variables}>{children}</ScopedVariables>;
}
