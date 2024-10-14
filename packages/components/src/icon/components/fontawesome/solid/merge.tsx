import * as React from "react";
import Svg, { Path } from "react-native-svg";
import type { SvgProps } from "react-native-svg";
const SvgMerge = (props: SvgProps) => (
  <Svg viewBox="0 0 512 512" {...props}>
    <Path d="M32 64C14.3 64 0 78.3 0 96s14.3 32 32 32h97.2c9.7 0 18.9 4.4 25 12L247 256l-92.8 116c-6.1 7.6-15.3 12-25 12H32c-17.7 0-32 14.3-32 32s14.3 32 32 32h97.2c29.2 0 56.7-13.3 75-36l99.2-124H384v32c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l64-64c6-6 9.4-14.1 9.4-22.6s-3.4-16.6-9.4-22.6l-64-64c-9.2-9.2-22.9-11.9-34.9-6.9S384 179.2 384 192.2v32h-80.6L204.2 100c-18.2-22.8-45.8-36-75-36z" />
  </Svg>
);
export default SvgMerge;
