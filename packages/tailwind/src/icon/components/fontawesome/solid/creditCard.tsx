import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgCreditCard = (props: SvgProps) => (
  <Svg viewBox="0 0 576 512" {...props}>
    <Path d="M64 32C28.7 32 0 60.7 0 96v32h576V96c0-35.3-28.7-64-64-64zm512 192H0v192c0 35.3 28.7 64 64 64h448c35.3 0 64-28.7 64-64zM112 352h64c8.8 0 16 7.2 16 16s-7.2 16-16 16h-64c-8.8 0-16-7.2-16-16s7.2-16 16-16m112 16c0-8.8 7.2-16 16-16h128c8.8 0 16 7.2 16 16s-7.2 16-16 16H240c-8.8 0-16-7.2-16-16" />
  </Svg>
);
export default SvgCreditCard;
