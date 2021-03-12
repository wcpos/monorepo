import { useCallback, useState } from 'react';

export default function useLayout() {
	const navigationRef = React.useRef<NavigationContainerRef>(null);
	const [appState, setAppState] = React.useState<IAppState>({ isReady: false });

	/**
	 * Deep linking for react-navigation
	 */
	const { getInitialState } = useLinking(navigationRef, {
		prefixes: [(window as any).location.origin || 'wcpos://'],
		config: { screens: routes },
	});

	React.useEffect(() => {
		async function hydrateAppState() {
			Promise.all([getInitialState(), getUser()])
				.then((result) => {
					const [initialState, user] = result;
					debugger;
					setAppState({ isReady: true, initialState });
				})
				.catch((err) => {
					console.log(err);
				});
		}

		hydrateAppState();
	}, [getInitialState]);
}
