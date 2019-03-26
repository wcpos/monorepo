import React from 'react';
import { createAppContainer } from 'react-navigation';
import RootNavigator from './root';
const NavigationApp = createAppContainer(RootNavigator);

// https://reactnavigation.org/docs/en/deep-linking.html#set-up-with-react-native-init-projects
const App = () => <NavigationApp uriPrefix="https://client.wcpos.com/" />;
export default App;
