function readObservable(observable) {
	const hooks = require('observable-hooks');
	if (typeof hooks.useObservableEagerState === 'function') {
		return hooks.useObservableEagerState(observable);
	}
	if (typeof observable?.getValue === 'function') return observable.getValue();
	return observable?.value;
}

function mockUseDocField(source, select) {
	if (source == null) return undefined;
	const emitted =
		typeof source.$?.subscribe === 'function' ? readObservable(source.$) : undefined;
	const current = emitted
		? typeof emitted.toJSON === 'function'
			? emitted.toJSON()
			: emitted
		: typeof source.getLatest === 'function'
			? source.getLatest()
			: source.$ && typeof source.get === 'function'
				? source.get()
				: source;
	const value = new Proxy(current, {
		get(target, property, receiver) {
			const observableProperty = `${String(property)}$`;
			if (Reflect.has(source, observableProperty)) {
				return readObservable(Reflect.get(source, observableProperty));
			}
			return Reflect.get(target, property, receiver);
		},
	});
	return select(value);
}

module.exports = { mockUseDocField };
