import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgCirclePause = (props: SvgProps) => (
  <Svg viewBox="0 0 512 512" {...props}>
    <Path d="M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512m-32-320v128c0 17.7-14.3 32-32 32s-32-14.3-32-32V192c0-17.7 14.3-32 32-32s32 14.3 32 32m128 0v128c0 17.7-14.3 32-32 32s-32-14.3-32-32V192c0-17.7 14.3-32 32-32s32 14.3 32 32" />
  </Svg>
);
export default SvgCirclePause;
