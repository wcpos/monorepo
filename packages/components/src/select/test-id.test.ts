it.each(['web', 'ios', 'android'])('maps a test ID only on %s web', (OS) => {
	jest.resetModules();
	jest.doMock('react-native', () => ({ Platform: { OS } }));
	const { webTestID } = jest.requireActual<typeof import('./test-id')>('./test-id');
	expect(webTestID('x')).toEqual(OS === 'web' ? { 'data-testid': 'x' } : {});
	expect(webTestID()).toEqual({});
});
