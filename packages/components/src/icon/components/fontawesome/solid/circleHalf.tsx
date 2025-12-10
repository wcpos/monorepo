import * as React from "react";
import Svg, { Path } from "react-native-svg";
import type { SvgProps } from "react-native-svg";
const SvgCircleHalf = (props: SvgProps) => (
  <Svg viewBox="0 0 512 512" {...props}>
    <Path d="M256 32c0-17.7-14.4-32.2-31.9-30C97.8 17.7 0 125.4 0 256s97.8 238.3 224.1 254c17.5 2.2 31.9-12.4 31.9-30z" />
  </Svg>
);
export default SvgCircleHalf;
