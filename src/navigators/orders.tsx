import React from 'react';
import { createStackNavigator } from 'react-navigation';
import Orders from '../sections/orders';
import Button from '../components/button';

const OrdersStack = createStackNavigator(
  {
    Orders: { screen: Orders },
  },
  {
    initialRouteName: 'Orders',
    defaultNavigationOptions: ({ navigation, screenProps }) => {
      return {
        headerTitle: 'Orders Header',
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

export default OrdersStack;
