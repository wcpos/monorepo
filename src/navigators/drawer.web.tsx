import React, { Component } from 'react';
import { SceneView, createNavigator, SwitchRouter } from '@react-navigation/core';
import POS from '../sections/pos';
import Products from '../sections/products';
import Orders from '../sections/orders';
import Customers from '../sections/customers';
import Support from '../sections/support';
import Menu from '../sections/menu';

interface Props {
  descriptors: any;
  navigation: any;
}

class AppView extends Component<Props> {
  render() {
    const { descriptors, navigation } = this.props;
    const activeKey = navigation.state.routes[navigation.state.index].key;
    const descriptor = descriptors[activeKey];
    return (
      <div>
        <Menu />
        <SceneView navigation={descriptor.navigation} component={descriptor.getComponent()} />
      </div>
    );
  }
}

const Drawer = createNavigator(
  AppView,
  SwitchRouter({
    POS: {
      screen: POS,
      path: 'cart',
    },
    Products: {
      screen: Products,
      path: 'products',
    },
    Orders: {
      screen: Orders,
      path: 'orders',
    },
    Customers: {
      screen: Customers,
      path: 'customers',
    },
    Support: {
      screen: Support,
      path: 'support',
    },
  }),
  {}
);

export default Drawer;
