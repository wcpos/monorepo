import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgUser = (props: SvgProps) => (
  <Svg viewBox="0 0 448 512" {...props}>
    <Path d="M224 256a128 128 0 1 0 0-256 128 128 0 1 0 0 256m-45.7 48C79.8 304 0 383.8 0 482.3 0 498.7 13.3 512 29.7 512h388.6c16.4 0 29.7-13.3 29.7-29.7 0-98.5-79.8-178.3-178.3-178.3z" />
  </Svg>
);
export default SvgUser;
