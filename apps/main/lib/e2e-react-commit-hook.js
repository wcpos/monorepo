// TEMP #3345 load: a minimal React DevTools hook so the production renderer reports each commit.
// metro.config.js runs it before every module only under EXPO_PUBLIC_WCPOS_E2E=1.
(function (g) {
	// TEMP #3345 load
	if (g.__REACT_DEVTOOLS_GLOBAL_HOOK__) return;
	g.__wcposE2eCommits = 0;
	g.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
		supportsFiber: true,
		isDisabled: false,
		inject: () => 1,
		onCommitFiberRoot: () => void g.__wcposE2eCommits++,
		onCommitFiberUnmount: () => {},
	};
})(globalThis);
