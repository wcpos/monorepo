import * as React from 'react';

/**
 * One command at a time. State renders it; the ref refuses a second call in the same tick,
 * before any render (two taps, or a press and a key, landing together). A throw still frees it.
 */
export function useExclusive<Name extends string = string>() {
	const [running, setRunning] = React.useState<Name | null>(null);
	const ref = React.useRef(false);
	const exclusive = React.useCallback(async (name: Name, task: () => Promise<void>) => {
		if (ref.current) return;
		ref.current = true;
		setRunning(name);
		try {
			await task();
		} finally {
			ref.current = false;
			setRunning(null);
		}
	}, []);
	const held = React.useCallback(() => ref.current, []);
	return { running, busy: running !== null, exclusive, held };
}
