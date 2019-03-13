import React from 'react';
import { createStackNavigator } from 'react-navigation';
import POS from '../sections/pos';
import Button from '../components/button';

const POSStack = createStackNavigator(
  {
    POS: { screen: POS },
  },
  {
    initialRouteName: 'POS',
    defaultNavigationOptions: ({ navigation, screenProps }) => {
      return {
        headerTitle: 'POS Header',
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

export default POSStack;
