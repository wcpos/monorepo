import { useEffect } from 'react';

import { onKeyPress, convertToAsciiEquivalent, getAsciiCode } from './keys';

export default function useKey(
	callback: any,
	{ detectKeys = [] } = {},
	{ dependencies = [] } = {}
) {
	let allowedKeys = detectKeys;

	if (!window || !window.document || !callback) {
		return;
	}

	if (!Array.isArray(dependencies)) {
		throw new Error(typeof dependencies);
	}

	if (!Array.isArray(detectKeys)) {
		allowedKeys = [];
		console.warn('Keys should be array!');
	}

	// @ts-ignore
	allowedKeys = convertToAsciiEquivalent(allowedKeys);

	useEffect(() => {
		window.document.addEventListener('keydown', (event) =>
			onKeyPress(getAsciiCode(event), callback, allowedKeys)
		);
		return () => {
			// @ts-ignore
			window.document.removeEventListener('keydown', onKeyPress);
		};
	}, [allowedKeys, callback]);
}
