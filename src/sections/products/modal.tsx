import React, { Component } from 'react';
import { View, Text, Button } from 'react-native';

interface Props {
  navigation: any;
}

class Modal extends Component<Props> {
  render() {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 30 }}>This is a modal!</Text>
        <Button onPress={() => this.props.navigation.goBack()} title="Dismiss" />
      </View>
    );
  }
}

export default Modal;
