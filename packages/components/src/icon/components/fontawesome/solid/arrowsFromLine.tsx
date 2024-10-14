import * as React from "react";
import Svg, { Path } from "react-native-svg";
import type { SvgProps } from "react-native-svg";
const SvgArrowsFromLine = (props: SvgProps) => (
  <Svg viewBox="0 0 448 512" {...props}>
    <Path d="M246.6 9.4c-12.5-12.5-32.8-12.5-45.3 0l-64 64c-9.2 9.2-11.9 22.9-6.9 34.9s16.6 19.8 29.6 19.8h32v32c0 17.7 14.3 32 32 32s32-14.3 32-32V128h32c12.9 0 24.6-7.8 29.6-19.8s2.2-25.7-6.9-34.9l-64-64zM192 352v32h-32c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l64 64c12.5 12.5 32.8 12.5 45.3 0l64-64c9.2-9.2 11.9-22.9 6.9-34.9S300.9 384 287.9 384H256v-32c0-17.7-14.3-32-32-32s-32 14.3-32 32M32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32h384c17.7 0 32-14.3 32-32s-14.3-32-32-32z" />
  </Svg>
);
export default SvgArrowsFromLine;
