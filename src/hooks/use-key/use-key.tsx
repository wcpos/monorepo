import { useEffect } from 'react';
import { onKeyPress, convertToAsciiEquivalent, getAsciiCode } from './keys';

export default function useKey(callback, { detectKeys = [] } = {}, { dependencies = [] } = {}) {
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

	allowedKeys = convertToAsciiEquivalent(allowedKeys);

	useEffect(() => {
		window.document.addEventListener('keydown', event =>
			onKeyPress(getAsciiCode(event), callback, allowedKeys)
		);
		return () => {
			window.document.removeEventListener('keydown', onKeyPress);
		};
	}, [allowedKeys, callback]);
}
