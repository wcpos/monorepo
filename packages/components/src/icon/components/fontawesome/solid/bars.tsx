import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgBars = (props: SvgProps) => (
  <Svg viewBox="0 0 448 512" {...props}>
    <Path d="M0 96c0-17.7 14.3-32 32-32h384c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32m0 160c0-17.7 14.3-32 32-32h384c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32m448 160c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32s14.3-32 32-32h384c17.7 0 32 14.3 32 32" />
  </Svg>
);
export default SvgBars;
