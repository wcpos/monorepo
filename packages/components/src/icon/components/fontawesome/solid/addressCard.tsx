import * as React from "react";
import Svg, { Path } from "react-native-svg";
import type { SvgProps } from "react-native-svg";
const SvgAddressCard = (props: SvgProps) => (
  <Svg viewBox="0 0 576 512" {...props}>
    <Path d="M64 32C28.7 32 0 60.7 0 96v320c0 35.3 28.7 64 64 64h448c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64zm80 256h64c44.2 0 80 35.8 80 80 0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16 0-44.2 35.8-80 80-80m-32-96a64 64 0 1 1 128 0 64 64 0 1 1-128 0m256-32h128c8.8 0 16 7.2 16 16s-7.2 16-16 16H368c-8.8 0-16-7.2-16-16s7.2-16 16-16m0 64h128c8.8 0 16 7.2 16 16s-7.2 16-16 16H368c-8.8 0-16-7.2-16-16s7.2-16 16-16m0 64h128c8.8 0 16 7.2 16 16s-7.2 16-16 16H368c-8.8 0-16-7.2-16-16s7.2-16 16-16" />
  </Svg>
);
export default SvgAddressCard;
