import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgIcons = (props: SvgProps) => (
  <Svg viewBox="0 0 512 512" {...props}>
    <Path d="M500.3 7.3c7.4 6 11.7 15.1 11.7 24.7v144c0 26.5-28.7 48-64 48s-64-21.5-64-48 28.7-48 64-48V71l-96 19.2V208c0 26.5-28.7 48-64 48s-64-21.5-64-48 28.7-48 64-48V64c0-15.3 10.8-28.4 25.7-31.4l160-32c9.4-1.9 19.1.6 26.6 6.6zM74.7 304l11.8-17.8c5.9-8.9 15.9-14.2 26.6-14.2h61.7c10.7 0 20.7 5.3 26.6 14.2l11.9 17.8H240c26.5 0 48 21.5 48 48v112c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V352c0-26.5 21.5-48 48-48zM192 408a48 48 0 1 0-96 0 48 48 0 1 0 96 0m286.7-129.7L440.3 368H496c6.7 0 12.6 4.1 15 10.4s.6 13.3-4.4 17.7l-128 112c-5.6 4.9-13.9 5.3-19.9.9s-8.2-12.4-5.3-19.2l38.3-89.8H336c-6.7 0-12.6-4.1-15-10.4s-.6-13.3 4.4-17.7l128-112c5.6-4.9 13.9-5.3 19.9-.9s8.2 12.4 5.3 19.2zm-339-59.2c-6.5 6.5-17 6.5-23 0l-96.8-99.9c-28-29-26.5-76.9 5-103.9 27-23.5 68.4-19 93.4 6.5l10 10.5 9.5-10.5c25-25.5 65.9-30 93.9-6.5 31 27 32.5 74.9 4.5 103.9l-96.4 99.9z" />
  </Svg>
);
export default SvgIcons;