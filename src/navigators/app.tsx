import React from 'react';
import { createStackNavigator } from 'react-navigation';
import Drawer from './drawer';
import Button from '../components/button';

const AppStack = createStackNavigator(
  {
    Drawer: { screen: Drawer },
  },
  {
    initialRouteName: 'Drawer',
    headerMode: 'none',
  }
);

export default AppStack;
