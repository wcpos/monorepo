import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgMessageMiddle = (props: SvgProps) => (
  <Svg viewBox="0 0 512 512" {...props}>
    <Path d="M343.5 416H448c35.3 0 64-28.7 64-64V64c0-35.3-28.7-64-64-64H64C28.7 0 0 28.7 0 64v288c0 35.3 28.7 64 64 64h104.5l75.2 90.2c3 3.6 7.5 5.8 12.3 5.8s9.3-2.1 12.3-5.8z" />
  </Svg>
);
export default SvgMessageMiddle;
