import React, { Component } from 'react';
import { View } from 'react-native';

interface Props {
  popover: any;
}

class Tooltip extends Component<Props> {
  render() {
    const { popover } = this.props;
    return <View>{popover}</View>;
  }
}

export default Tooltip;
