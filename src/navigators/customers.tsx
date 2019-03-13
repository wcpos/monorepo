import React from 'react';
import { createStackNavigator } from 'react-navigation';
import Customers from '../sections/customers';
import Button from '../components/button';

const CustomersStack = createStackNavigator(
  {
    Customers: { screen: Customers },
  },
  {
    initialRouteName: 'Customers',
    defaultNavigationOptions: ({ navigation, screenProps }) => {
      return {
        headerTitle: 'Customers Header',
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

export default CustomersStack;
