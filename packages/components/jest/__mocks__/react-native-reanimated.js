/**
 * react-native-reanimated ships ESM only, so a suite fails to load the moment a component it
 * renders imports the library. Since `Icon count` (#3402) every Icon pulls in `Badge`'s count
 * beat, so a suite that renders any icon would otherwise need a per-file mock. Here every
 * animation resolves to its end value at once and the animated views are the plain ones; a
 * suite that asserts on an animation still mocks the module itself (`jest.mock` wins over
 * this mapping).
 */
const React = require('react');
const { Text, View } = require('react-native');

const settled = (value) => value;
const preset = () => {
	const chain = {};
	for (const step of ['duration', 'delay', 'springify', 'damping', 'easing', 'withInitialValues'])
		chain[step] = () => chain;
	chain.build = () => ({});
	return chain;
};

module.exports = {
	__esModule: true,
	default: {
		View,
		Text,
		createAnimatedComponent: (component) => component,
	},
	Easing: { bezier: () => 'ease', linear: 'linear', inOut: (fn) => fn, ease: 'ease' },
	Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend' },
	ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
	LayoutAnimationConfig: ({ children }) => React.createElement(React.Fragment, null, children),
	LinearTransition: preset(),
	FadeIn: preset(),
	FadeInDown: preset(),
	FadeOut: preset(),
	ZoomIn: preset(),
	SlideInDown: preset(),
	SlideInLeft: preset(),
	SlideInRight: preset(),
	SlideOutDown: preset(),
	SlideOutLeft: preset(),
	SlideOutRight: preset(),
	cubicBezier: () => 'ease',
	interpolate: (value) => value,
	interpolateColor: (_value, _input, output) => output[0],
	useAnimatedReaction: () => undefined,
	useAnimatedStyle: () => ({}),
	useDerivedValue: (fn) => ({ value: fn() }),
	useReducedMotion: () => false,
	useSharedValue: (value) => React.useRef({ value }).current,
	withDelay: (_ms, value) => value,
	withRepeat: settled,
	withSequence: (...steps) => steps.at(-1),
	withSpring: settled,
	withTiming: settled,
};
