/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { transformSync } from '@babel/core';

// Reanimated's OWN assignment and clocks — `valueSetter`, `withDelay`, `withTiming`, `Easing` —
// loaded from its build, so the test pins what the library does with a clock, not the shape of
// a call. Its build is ESM and its `animation/util` reaches the native runtime, so the modules
// are compiled here and `util` is the three pure helpers they take from it.
const BUILD = join(dirname(require.resolve('react-native-reanimated/package.json')), 'lib/module');
const UTIL = {
	defineAnimation: (_starting: unknown, factory: () => unknown) => factory(),
	getReduceMotionForAnimation: () => false,
	assertEasingIsWorklet: () => {},
};
const loaded = new Map<string, Record<string, unknown>>();
function load(file: string): Record<string, unknown> {
	const known = loaded.get(file);
	if (known) return known;
	const { code } = transformSync(readFileSync(file, 'utf8'), {
		babelrc: false,
		configFile: false,
		plugins: ['@babel/plugin-transform-modules-commonjs'],
	})!;
	const exports: Record<string, unknown> = {};
	loaded.set(file, exports);
	const localRequire = (path: string) =>
		path === './util'
			? UTIL
			: load(join(dirname(file), path.endsWith('.js') ? path : `${path}.js`));
	new Function('exports', 'require', code!)(exports, localRequire);
	return exports;
}
const { valueSetter } = load(join(BUILD, 'valueSetter.js')) as {
	valueSetter: (mutable: Mutable, value: unknown) => void;
};
const { withDelay: mockWithDelay } = load(join(BUILD, 'animation/delay.js')) as {
	withDelay: (delay: number, clock: unknown) => unknown;
};
const { withTiming } = load(join(BUILD, 'animation/timing.js')) as {
	withTiming: (to: number, config: { duration: number; easing: unknown }) => unknown;
};
const { Easing } = load(join(BUILD, 'Easing.js')) as { Easing: { linear: unknown } };

jest.mock('react-native-reanimated', () => ({
	withDelay: (delay: number, clock: unknown) => mockWithDelay(delay, clock),
}));

/* eslint-disable import/first */
import { fromFirstFrame } from './first-frame';
/* eslint-enable import/first */

type Mutable = { _value: number; _animation: unknown; value: number };

// The UI thread: the time it receives an assignment, and the frames it runs after it.
let received = 0;
let frames: ((timestamp: number) => void)[] = [];
const runFrame = (timestamp: number) => {
	const due = frames;
	frames = [];
	due.forEach((step) => step(timestamp));
};
beforeEach(() => {
	frames = [];
	Object.assign(globalThis, {
		__frameTimestamp: undefined,
		_getAnimationTimestamp: () => received,
		requestAnimationFrame: (step: (timestamp: number) => void) => frames.push(step),
	});
});

const mutable = (): Mutable => ({
	_value: 0,
	_animation: null,
	get value() {
		return this._value;
	},
});
// The deal's walk: 280 ms; linear, so the value read is the share of the time spent.
const walk = () => withTiming(1, { duration: 280, easing: Easing.linear });

// Pixel 4b: the clock was received at 1000 ms, the UI thread then mounted the commit, and the
// first frame it painted was 144 ms later.
it('a clock from the first frame paints its start on that frame, however late it comes', () => {
	const travel = mutable();
	received = 1000;
	valueSetter(travel, fromFirstFrame(walk()));
	expect(travel.value).toBe(0);
	runFrame(1144);
	expect(travel.value).toBe(0);
	runFrame(1160);
	expect(travel.value).toBeCloseTo(16 / 280);
});

it('an unwrapped clock (and a zero delay) is already part-way through on that frame', () => {
	const plain = mutable();
	received = 1000;
	valueSetter(plain, walk());
	runFrame(1144);
	expect(plain.value).toBeCloseTo(144 / 280);
	const zero = mutable();
	valueSetter(zero, mockWithDelay(0, walk()));
	runFrame(1144);
	expect(zero.value).toBeCloseTo(144 / 280);
});
