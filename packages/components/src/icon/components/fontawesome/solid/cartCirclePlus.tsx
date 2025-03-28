import * as React from "react";
import Svg, { Path } from "react-native-svg";
import type { SvgProps } from "react-native-svg";
const SvgCartCirclePlus = (props: SvgProps) => (
  <Svg viewBox="0 0 640 512" {...props}>
    <Path d="M0 24C0 10.7 10.7 0 24 0h45.5c22 0 41.5 12.8 50.6 32h411c26.3 0 45.5 25 38.6 50.4l-30.9 114.8c-13.7-3.4-28.1-5.2-42.8-5.2-68.4 0-127.7 39-156.8 96H170.7l5.4 28.5c2.2 11.3 12.1 19.5 23.6 19.5h123.2c-1.9 10.4-2.9 21.1-2.9 32 0 5.4.2 10.7.7 16h-121c-34.6 0-64.3-24.6-70.7-58.5l-51.6-271c-.7-3.8-4-6.5-7.9-6.5H24C10.7 48 0 37.3 0 24m128 440a48 48 0 1 1 96 0 48 48 0 1 1-96 0m512-96a144 144 0 1 1-288 0 144 144 0 1 1 288 0m-80 16c8.8 0 16-7.2 16-16s-7.2-16-16-16h-48v-48c0-8.8-7.2-16-16-16s-16 7.2-16 16v48h-48c-8.8 0-16 7.2-16 16s7.2 16 16 16h48v48c0 8.8 7.2 16 16 16s16-7.2 16-16v-48z" />
  </Svg>
);
export default SvgCartCirclePlus;
