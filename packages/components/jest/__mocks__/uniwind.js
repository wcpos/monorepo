/**
 * uniwind ships ESM only. Every overlay (dialog, alert, sheet) imports it through
 * `lib/use-spacing-unit` (#3410: the panel's own padding follows the spacing step), so a suite
 * would fail to load without a per-file mock. Here nothing is themed: a variable reads as unset,
 * which `useSpacingUnit` turns into Regular's 4, and `withUniwind` hands the component back. A suite
 * that asserts a themed value still mocks the module itself (`jest.mock('uniwind', …)` wins).
 */
module.exports = {
	useCSSVariable: () => undefined,
	withUniwind: (component) => component,
	useUniwind: () => ({}),
	Uniwind: {},
	ScopedVariables: ({ children }) => children,
};
