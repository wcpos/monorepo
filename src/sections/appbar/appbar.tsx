import React, { Component } from 'react';
import { Text } from 'react-native';
import Icon from '../../components/icon';

interface Props {
  navigation?: any;
}

class AppBar extends Component<Props> {
  render() {
    return <Icon name="bars" onPress={() => this.props.navigation.toggleDrawer()} />;
  }
}

export default AppBar;
