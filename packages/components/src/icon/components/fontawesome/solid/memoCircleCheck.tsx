import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgMemoCircleCheck = (props: SvgProps) => (
  <Svg viewBox="0 0 576 512" {...props}>
    <Path d="M0 64C0 28.7 28.7 0 64 0h256c35.3 0 64 28.7 64 64v134.6c-73.9 20.9-128 88.8-128 169.4 0 59.1 29.1 111.3 73.7 143.3-3.2.5-6.4.7-9.7.7H64c-35.3 0-64-28.7-64-64zm64 80c0 8.8 7.2 16 16 16h224c8.8 0 16-7.2 16-16s-7.2-16-16-16H80c-8.8 0-16 7.2-16 16m16 80c-8.8 0-16 7.2-16 16s7.2 16 16 16h160c8.8 0 16-7.2 16-16s-7.2-16-16-16zm0 96c-8.8 0-16 7.2-16 16s7.2 16 16 16h96c8.8 0 16-7.2 16-16s-7.2-16-16-16zm208 48a144 144 0 1 1 288 0 144 144 0 1 1-288 0m188.7-43.3L416 385.4l-28.7-28.7c-6.2-6.2-16.4-6.2-22.6 0s-6.2 16.4 0 22.6l40 40c6.2 6.2 16.4 6.2 22.6 0l72-72c6.2-6.2 6.2-16.4 0-22.6s-16.4-6.2-22.6 0" />
  </Svg>
);
export default SvgMemoCircleCheck;