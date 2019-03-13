import React from 'react';
import { createStackNavigator } from 'react-navigation';
import Support from '../sections/support';
import Button from '../components/button';

const SupportStack = createStackNavigator(
  {
    Support: { screen: Support },
  },
  {
    initialRouteName: 'Support',
    defaultNavigationOptions: ({ navigation, screenProps }) => {
      return {
        headerTitle: 'Support Header',
        headerStyle: {
          backgroundColor: '#f4511e',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerRight: (
          <Button
            onPress={() => alert('This is a button!')}
            title="Info"
            // color="#fff"
          />
        ),
      };
    },
  }
);

export default SupportStack;
