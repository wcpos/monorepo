import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgCalculator = (props: SvgProps) => (
  <Svg viewBox="0 0 384 512" {...props}>
    <Path d="M64 0C28.7 0 0 28.7 0 64v384c0 35.3 28.7 64 64 64h256c35.3 0 64-28.7 64-64V64c0-35.3-28.7-64-64-64zm32 64h192c17.7 0 32 14.3 32 32v32c0 17.7-14.3 32-32 32H96c-17.7 0-32-14.3-32-32V96c0-17.7 14.3-32 32-32m32 160a32 32 0 1 1-64 0 32 32 0 1 1 64 0M96 352a32 32 0 1 1 0-64 32 32 0 1 1 0 64m-32 64c0-17.7 14.3-32 32-32h96c17.7 0 32 14.3 32 32s-14.3 32-32 32H96c-17.7 0-32-14.3-32-32m128-160a32 32 0 1 1 0-64 32 32 0 1 1 0 64m32 64a32 32 0 1 1-64 0 32 32 0 1 1 64 0m64-64a32 32 0 1 1 0-64 32 32 0 1 1 0 64m32 64a32 32 0 1 1-64 0 32 32 0 1 1 64 0m-32 128a32 32 0 1 1 0-64 32 32 0 1 1 0 64" />
  </Svg>
);
export default SvgCalculator;