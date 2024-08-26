import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgPlus = (props: SvgProps) => (
  <Svg viewBox="0 0 448 512" {...props}>
    <Path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32v144H48c-17.7 0-32 14.3-32 32s14.3 32 32 32h144v144c0 17.7 14.3 32 32 32s32-14.3 32-32V288h144c17.7 0 32-14.3 32-32s-14.3-32-32-32H256z" />
  </Svg>
);
export default SvgPlus;
