import React from 'react';
// import { Dimensions } from 'react-native';
import { createDrawerNavigator } from 'react-navigation';
import POSStack from './pos';
import ProductsStack from './products';
import OrdersStack from './orders';
import CustomersStack from './customers';
import SupportStack from './support';
import Icon from '../components/icon';
import Button from '../components/button';

// const deviceWidth = Dimensions.get('window').width;

const Drawer = createDrawerNavigator(
  {
    POS: {
      screen: POSStack,
      navigationOptions: {
        title: 'POS',
        drawerLabel: 'POS',
        drawerIcon: () => <Icon name="cog" />,
        headerTitle: 'POS Title',
        headerStyle: {
          backgroundColor: '#f4511e',
        },
      },
    },
    Products: {
      screen: ProductsStack,
      navigationOptions: {
        title: 'Products',
        drawerLabel: 'Products',
        drawerIcon: () => <Icon name="cog" />,
      },
    },
    Orders: {
      screen: OrdersStack,
      navigationOptions: {
        title: 'Orders',
        drawerLabel: 'Orders',
        drawerIcon: () => <Icon name="cog" />,
      },
    },
    Customers: {
      screen: CustomersStack,
      navigationOptions: {
        title: 'Customers',
        drawerLabel: 'Customers',
        drawerIcon: () => <Icon name="cog" />,
      },
    },
    Support: {
      screen: SupportStack,
      navigationOptions: {
        title: 'Support',
        drawerLabel: 'Support',
        drawerIcon: () => <Icon name="cog" />,
      },
    },
  },
  {
    // drawerWidth: deviceWidth * 0.83,
    drawerPosition: 'left',
    initialRouteName: 'POS',
    // contentComponent: (props: any) => <Text>hi</Text>,
    defaultNavigationOptions: ({ navigation, screenProps }) => {
      return {
        headerTitle: 'My Store!',
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

export default Drawer;
