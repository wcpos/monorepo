import * as React from "react";
import Svg, { Path } from "react-native-svg";
import type { SvgProps } from "react-native-svg";
const SvgMessageBot = (props: SvgProps) => (
  <Svg viewBox="0 0 640 512" {...props}>
    <Path d="M160 0c-35.3 0-64 28.7-64 64v112H59.7c-5.5-9.6-15.9-16-27.7-16-17.7 0-32 14.3-32 32s14.3 32 32 32c11.8 0 22.2-6.4 27.7-16H96v144c0 35.3 28.7 64 64 64h64v80c0 6.1 3.4 11.6 8.8 14.3s11.9 2.1 16.8-1.5L373.3 416H480c35.3 0 64-28.7 64-64V208h36.3c5.5 9.6 15.9 16 27.7 16 17.7 0 32-14.3 32-32s-14.3-32-32-32c-11.8 0-22.2 6.4-27.7 16H544V64c0-35.3-28.7-64-64-64zm0 128c0-17.7 14.3-32 32-32h256c17.7 0 32 14.3 32 32v128c0 17.7-14.3 32-32 32H192c-17.7 0-32-14.3-32-32zm64 96a32 32 0 1 0 0-64 32 32 0 1 0 0 64m192 0a32 32 0 1 0 0-64 32 32 0 1 0 0 64" />
  </Svg>
);
export default SvgMessageBot;
