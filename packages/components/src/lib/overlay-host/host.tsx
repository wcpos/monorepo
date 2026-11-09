import * as React from 'react';
import { Platform, View, type ViewInstance } from 'react-native';

import { ErrorBoundary } from '../../error-boundary';
import { PortalHost } from '../../portal';
import { registerPortalContainer } from '../portal-container';
import { OverlayHostProvider } from './index';

/**
 * A layout's portal host, in one place: it registers its view as the web container of `name`
 * (dialog ledger 7), mounts the native `PortalHost` after its children inside an error boundary,
 * and names itself to every `DialogContent` below that names no host. `active={false}` unmounts
 * the native host alone (a blurred drawer screen's); the web container stays registered.
 */
export function OverlayHost({
	name,
	phoneUsesRoot = false,
	active = true,
	children,
}: React.PropsWithChildren<{ name: string; phoneUsesRoot?: boolean; active?: boolean }>) {
	const register = React.useCallback(
		(node: ViewInstance | null) => {
			registerPortalContainer(
				name,
				Platform.OS === 'web' ? (node as unknown as HTMLElement) : null
			);
		},
		[name]
	);
	return (
		<OverlayHostProvider name={name} phoneUsesRoot={phoneUsesRoot}>
			<View ref={register} className="flex-1">
				{children}
				{active && (
					<ErrorBoundary>
						<PortalHost name={name} />
					</ErrorBoundary>
				)}
			</View>
		</OverlayHostProvider>
	);
}
