// Native/Electron do not coordinate dedicated web workers.
export const holdLiveTab =
	(_reason: 'payment' | 'write'): (() => void) =>
	() => {};
