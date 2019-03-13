import React from 'react';
import { View, Text } from 'react-native';

interface Props {
  orders: any;
  setActiveOrder: any;
}

const Tabs = ({ orders = [], setActiveOrder }: Props) => (
  <View>
    {orders.map((order: any) => (
      <Text key={order.id} onPress={() => setActiveOrder(order)}>
        {order.number}
      </Text>
    ))}
    <Text onPress={() => setActiveOrder(null)}>+</Text>
  </View>
);

export default Tabs;
