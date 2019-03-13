import { Platform as RNPlatform } from 'react-native';

const Platform = {
  ...RNPlatform,
  isElectron: false,
};

export default Platform;
