// Inert stand-in for react-native-reanimated: its build is ESM and cannot load here, and
// shared components (the count badge) animate with it. Values land at once and nothing
// moves. A suite that asserts on motion mocks the module itself, which overrides this.
const React = require('react');
const { ScrollView, Text, View } = require('react-native');

const lands = (value) => value;

module.exports = {
	__esModule: true,
	default: { View, Text, ScrollView, createAnimatedComponent: (Component) => Component },
	ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
	Easing: { bezier: () => 'ease', linear: 'linear' },
	Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
	interpolate: lands,
	useAnimatedStyle: () => ({}),
	useSharedValue: (value) => React.useRef({ value }).current,
	withSequence: (...steps) => steps.at(-1),
	withSpring: lands,
	withTiming: lands,
};
