import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgGripLinesVertical = (props: SvgProps) => (
  <Svg viewBox="0 0 192 512" {...props}>
    <Path d="M64 64c0-17.7-14.3-32-32-32S0 46.3 0 64v384c0 17.7 14.3 32 32 32s32-14.3 32-32zm128 0c0-17.7-14.3-32-32-32s-32 14.3-32 32v384c0 17.7 14.3 32 32 32s32-14.3 32-32z" />
  </Svg>
);
export default SvgGripLinesVertical;
