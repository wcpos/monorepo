import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgBan = (props: SvgProps) => (
  <Svg viewBox="0 0 512 512" {...props}>
    <Path d="M367.2 412.5 99.5 144.8C77.1 176.1 64 214.5 64 256c0 106 86 192 192 192 41.5 0 79.9-13.1 111.2-35.5m45.3-45.3C434.9 335.9 448 297.5 448 256c0-106-86-192-192-192-41.5 0-79.9 13.1-111.2 35.5zM0 256a256 256 0 1 1 512 0 256 256 0 1 1-512 0" />
  </Svg>
);
export default SvgBan;
