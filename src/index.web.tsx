import { AppRegistry } from 'react-native';
import App from './app';

// register the app
AppRegistry.registerComponent('example', () => App);

AppRegistry.runApplication('example', {
  rootTag: document.getElementById('root'),
});
