import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgSliders = (props: SvgProps) => (
  <Svg viewBox="0 0 512 512" {...props}>
    <Path d="M0 416c0 17.7 14.3 32 32 32h54.7c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48H480c17.7 0 32-14.3 32-32s-14.3-32-32-32H233.3c-12.3-28.3-40.5-48-73.3-48s-61 19.7-73.3 48H32c-17.7 0-32 14.3-32 32m128 0a32 32 0 1 1 64 0 32 32 0 1 1-64 0m192-160a32 32 0 1 1 64 0 32 32 0 1 1-64 0m32-80c-32.8 0-61 19.7-73.3 48H32c-17.7 0-32 14.3-32 32s14.3 32 32 32h246.7c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48H480c17.7 0 32-14.3 32-32s-14.3-32-32-32h-54.7c-12.3-28.3-40.5-48-73.3-48m-160-48a32 32 0 1 1 0-64 32 32 0 1 1 0 64m73.3-64C253 35.7 224.8 16 192 16s-61 19.7-73.3 48H32C14.3 64 0 78.3 0 96s14.3 32 32 32h86.7c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48H480c17.7 0 32-14.3 32-32s-14.3-32-32-32z" />
  </Svg>
);
export default SvgSliders;