/* global jest */
// This runner resolves `react-native-svg` to its native source (fabric codegen, no host here).
// The gate family draws the Logo through it on every platform, so every screen that mounts a
// gate would fail to load. Serve the library's own web elements instead, as
// `icon-set/schema-parity.test.ts` did per suite before this mock existed.
const elements = jest.requireActual('react-native-svg/lib/commonjs/elements.web');

module.exports = { ...elements, default: elements.Svg, __esModule: true };
