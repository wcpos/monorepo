import React from 'react';
import { createStackNavigator } from 'react-navigation';
import Products from '../sections/products';
import Button from '../components/button';
import Modal from '../sections/products/modal';

const ProductsStack = createStackNavigator(
  {
    Products: { screen: Products },
    Modal: { screen: Modal },
  },
  {
    initialRouteName: 'Products',
    defaultNavigationOptions: ({ navigation, screenProps }) => {
      return {
        headerTitle: 'Products Header',
        headerStyle: {
          backgroundColor: '#f4511e',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerRight: (
          <Button
            onPress={() => navigation.navigate('Modal')}
            title="Info"
            // color="#fff"
          />
        ),
      };
    },
  }
);

export default ProductsStack;
