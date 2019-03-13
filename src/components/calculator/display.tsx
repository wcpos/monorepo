import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const calculatorDisplayStyles = StyleSheet.create({
  root: {
    backgroundColor: '#1c191c',
    flex: 1,
    justifyContent: 'center',
  },
  text: {
    alignSelf: 'flex-end',
    color: 'white',
    // lineHeight: 130,
    // fontSize: '5.25em',
    fontSize: 5.25,
    fontWeight: '100',
    fontFamily: 'Roboto, sans-serif',
    paddingHorizontal: 30,
    // position: 'absolute',
    right: 0,
    transformOrigin: 'right',
  },
});

interface Props {
  value: string;
}

interface State {
  scale: number;
}

class Display extends React.Component<Props, State> {
  constructor(props: any, context: any) {
    super(props, context);
    this.state = {
      scale: 1,
    };
  }

  handleTextLayout = (e: any) => {
    const { width, x } = e.nativeEvent.layout;
    const maxWidth = width + x;
    const newScale = maxWidth / width;
    if (x < 0) {
      this.setState({ scale: newScale });
    } else if (x > width) {
      this.setState({ scale: 1 });
    }
  };

  render() {
    const { value } = this.props;
    const { scale } = this.state;

    const language = navigator.language || 'en-US';
    let formattedValue = parseFloat(value).toLocaleString(language, {
      useGrouping: true,
      maximumFractionDigits: 6,
    });

    const trailingZeros = value.match(/\.0*$/);

    if (trailingZeros) {
      formattedValue += trailingZeros;
    }

    return (
      <View style={calculatorDisplayStyles.root}>
        <Text
          children={formattedValue}
          onLayout={this.handleTextLayout}
          style={[calculatorDisplayStyles.text, { transform: [{ scale }] }]}
        />
      </View>
    );
  }
}

export default Display;
