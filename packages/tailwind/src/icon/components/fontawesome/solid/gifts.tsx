import * as React from "react";
import Svg, { SvgProps, Path } from "react-native-svg";
const SvgGifts = (props: SvgProps) => (
  <Svg viewBox="0 0 640 512" {...props}>
    <Path d="M200.6 32C205 19.5 198.5 5.8 186 1.4S159.8 3.5 155.4 16l-10.7 30.2-9.9-29.8C130.6 3.8 117-3 104.4 1.2S85 19 89.2 31.6l8.3 25-27.4-20c-10.7-7.8-25.7-5.4-33.5 5.3s-5.4 25.7 5.3 33.5L70.2 96H48c-26.5 0-48 21.5-48 48v320c0 26.5 21.5 48 48 48h152.6c-5.4-9.4-8.6-20.3-8.6-32V256c0-29.9 20.5-55 48.2-62 1.8-31 17.1-58.2 40.1-76.1C271.7 104.7 256.9 96 240 96h-22.2l28.3-20.6c10.7-7.8 13.1-22.8 5.3-33.5s-22.8-13.1-33.5-5.3l-25.4 18.5zm162.9 153.5 29.6 38.5H344c-13.3 0-24-10.7-24-24 0-13.1 10.8-24 24.2-24 7.6 0 14.7 3.5 19.3 9.5M272 200c0 8.4 1.4 16.5 4.1 24H272c-26.5 0-48 21.5-48 48v80h192v-96h32v96h192v-80c0-26.5-21.5-48-48-48h-4.1c2.7-7.5 4.1-15.6 4.1-24 0-39.9-32.5-72-72.2-72-22.4 0-43.6 10.4-57.3 28.2L432 195.8l-30.5-39.6c-13.7-17.8-35-28.2-57.3-28.2-39.7 0-72.2 32.1-72.2 72m-48 264c0 26.5 21.5 48 48 48h144V384H224zm224 48h144c26.5 0 48-21.5 48-48v-80H448zm96-312c0 13.3-10.7 24-24 24h-49.1l29.6-38.5c4.6-5.9 11.7-9.5 19.3-9.5 13.4 0 24.2 10.9 24.2 24" />
  </Svg>
);
export default SvgGifts;