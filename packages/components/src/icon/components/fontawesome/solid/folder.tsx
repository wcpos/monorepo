import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgFolder = (props: SvgProps) => (
  <Svg viewBox="0 0 512 512" {...props}>
    <Path d="M64 480h384c35.3 0 64-28.7 64-64V160c0-35.3-28.7-64-64-64H288c-10.1 0-19.6-4.7-25.6-12.8l-19.2-25.6C231.1 41.5 212.1 32 192 32H64C28.7 32 0 60.7 0 96v320c0 35.3 28.7 64 64 64" />
  </Svg>
);
export default SvgFolder;
