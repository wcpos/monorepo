import { Platform as RNPlatform } from 'react-native';

function isElectron() {
  // https://github.com/cheton/is-electron
}

const Platform = {
  ...RNPlatform,
  isElectron: isElectron(),
  isStandalone: (window.navigator as any).standalone,
};

export default Platform;
