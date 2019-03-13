import { createStackNavigator } from 'react-navigation';
import Auth from '../auth';

const AuthStack = createStackNavigator(
  {
    Auth: { screen: Auth },
  },
  {
    initialRouteName: 'Auth',
    headerMode: 'none',
  }
);

export default AuthStack;
