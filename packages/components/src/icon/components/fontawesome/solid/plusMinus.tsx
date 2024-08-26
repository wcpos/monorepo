import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgPlusMinus = (props: SvgProps) => (
  <Svg viewBox="0 0 384 512" {...props}>
    <Path d="M224 32c0-17.7-14.3-32-32-32s-32 14.3-32 32v112H48c-17.7 0-32 14.3-32 32s14.3 32 32 32h112v112c0 17.7 14.3 32 32 32s32-14.3 32-32V208h112c17.7 0 32-14.3 32-32s-14.3-32-32-32H224zM0 480c0 17.7 14.3 32 32 32h320c17.7 0 32-14.3 32-32s-14.3-32-32-32H32c-17.7 0-32 14.3-32 32" />
  </Svg>
);
export default SvgPlusMinus;
