import * as React from 'react';

import { useObservableRef } from 'observable-hooks';
import { filter } from 'rxjs/operators';

const document = typeof window !== 'undefined' ? window.document : null;
let hidden: string, visibilityChange: string;

if (typeof document?.hidden !== 'undefined') {
	hidden = 'hidden';
	visibilityChange = 'visibilitychange';
} else if (typeof document?.msHidden !== 'undefined') {
	hidden = 'msHidden';
	visibilityChange = 'msvisibilitychange';
} else if (typeof document?.webkitHidden !== 'undefined') {
	hidden = 'webkitHidden';
	visibilityChange = 'webkitvisibilitychange';
}

type Callback = (hidden: boolean) => void;

/*
 * This react hook tracks page visibility using browser page visibility api.
 * Reference: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
 *
 * Optionally, you can pass a callback function that will be called when the page visibility changes.
 * Or, it will return an observable that you can subscribe to.
 */
export function usePageVisibility(callback: Callback = () => {}) {
	const [visibilityRef, visibility$] = useObservableRef(null);

	React.useEffect(() => {
		function handleVisibilityChange() {
			visibilityRef.current = document[hidden];
			callback(document[hidden]);
		}

		document?.addEventListener(visibilityChange, handleVisibilityChange);

		return () => {
			document?.removeEventListener(visibilityChange, handleVisibilityChange);
		};
	}, [callback, visibilityRef]);

	return {
		visibility$,
		visibile$: visibility$.pipe(filter((hidden) => !hidden)),
		hidden$: visibility$.pipe(filter((hidden) => !!hidden)),
	};
}
