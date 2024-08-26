import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgCircle = (props: SvgProps) => (
  <Svg viewBox="0 0 512 512" {...props}>
    <Path d="M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512" />
  </Svg>
);
export default SvgCircle;
