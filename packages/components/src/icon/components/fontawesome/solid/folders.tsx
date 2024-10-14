import * as React from "react";
import Svg, { Path } from "react-native-svg";
import type { SvgProps } from "react-native-svg";
const SvgFolders = (props: SvgProps) => (
  <Svg viewBox="0 0 576 512" {...props}>
    <Path d="M512 384c35.3 0 64-28.7 64-64V160c0-35.3-28.7-64-64-64H394.5c-17 0-33.3-6.7-45.3-18.7l-26.5-26.6c-12-12-28.3-18.7-45.3-18.7H160c-35.3 0-64 28.7-64 64v224c0 35.3 28.7 64 64 64zM48 120c0-13.3-10.7-24-24-24S0 106.7 0 120v224c0 75.1 60.9 136 136 136h320c13.3 0 24-10.7 24-24s-10.7-24-24-24H136c-48.6 0-88-39.4-88-88z" />
  </Svg>
);
export default SvgFolders;
