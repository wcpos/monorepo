import React, { Component } from 'react';

interface Props {
  popover: any;
}

class Tooltip extends Component<Props> {
  render() {
    const { popover } = this.props;
    return <div>{popover}</div>;
  }
}

export default Tooltip;
