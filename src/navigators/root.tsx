import { createSwitchNavigator } from '@react-navigation/core';
import Loading from '../loading';
import AuthStack from './auth';
import AppStack from './app';

const RootStack = createSwitchNavigator(
  {
    Loading: {
      screen: Loading,
      path: 'loading',
    },
    App: {
      screen: AppStack,
      path: 'pos',
    },
    Auth: {
      screen: AuthStack,
      path: 'auth',
    },
  },
  {
    initialRouteName: 'Loading',
  }
);

export default RootStack;
