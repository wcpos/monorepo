import React, { ReactNode, useContext } from 'react';
import {
  Text,
  View,
  TextInput,
  Animated,
  Easing,
  StyleSheet,
  TextStyle,
  ViewStyle,
} from 'react-native';
import styles from './styles';
import Icon from '../icon';
// import { ThemeContext } from '../../lib/theme';

// const renderText = (content, defaultProps, style) =>
//   renderNode(Text, content, {
//     ...defaultProps,
//     style: StyleSheet.flatten([style, defaultProps && defaultProps.style]),
//   });

interface Props {
  containerStyle?: ViewStyle;
  inputContainerStyle?: ViewStyle;
  leftIcon?: ReactNode;
  leftIconContainerStyle?: ViewStyle;
  rightIcon?: ReactNode;
  rightIconContainerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  inputComponent?: any;
  shake?: any;
  errorProps?: {};
  errorStyle?: TextStyle;
  errorMessage?: string;
  label?: ReactNode;
  labelStyle?: TextStyle;
  labelProps?: {};
  placeholder?: string;
  onChangeText?: (text: string) => void;
}

const Input = (props: Props) => {
  const theme = {};
  const shakeAnimationValue = new Animated.Value(0);

  // focus() {
  //   this.input.focus();
  // }

  // blur() {
  //   this.input.blur();
  // }

  // clear() {
  //   this.input.clear();
  // }

  // isFocused() {
  //   return this.input.isFocused();
  // }

  // setNativeProps(nativeProps) {
  //   this.input.setNativeProps(nativeProps);
  // }

  const shake = () => {
    shakeAnimationValue.setValue(0);
    // Animation duration based on Material Design
    // https://material.io/guidelines/motion/duration-easing.html#duration-easing-common-durations
    Animated.timing(shakeAnimationValue, {
      duration: 375,
      toValue: 3,
      // ease: Easing.bounce,
    }).start();
  };

  const {
    containerStyle,
    inputContainerStyle,
    leftIcon,
    leftIconContainerStyle,
    rightIcon,
    rightIconContainerStyle,
    inputComponent: InputComponent = TextInput,
    inputStyle,
    errorProps,
    errorStyle,
    errorMessage,
    label,
    labelStyle,
    labelProps,
    ...attributes
  } = props;

  const translateX = shakeAnimationValue.interpolate({
    inputRange: [0, 0.5, 1, 1.5, 2, 2.5, 3],
    outputRange: [0, -15, 0, 15, 0, -15, 0],
  });

  return (
    <View style={StyleSheet.flatten([styles.container, containerStyle])}>
      {/* {renderText(label, { style: labelStyle, ...labelProps }, styles.label(theme))} */}

      <Animated.View
        style={StyleSheet.flatten([
          inputContainerStyle,
          // { transform: [{ translateX }] },
        ])}
      >
        {leftIcon && (
          <View style={StyleSheet.flatten([styles.iconContainer, leftIconContainerStyle])}>
            {/* {renderNode(Icon, leftIcon)} */}
          </View>
        )}

        <InputComponent
          testID="RNE__Input__text-input"
          underlineColorAndroid="transparent"
          {...attributes}
          // ref={ref => {
          //   this.input = ref;
          // }}
          style={StyleSheet.flatten([styles.input, inputStyle])}
        />

        {rightIcon && (
          <View style={StyleSheet.flatten([styles.iconContainer, rightIconContainerStyle])}>
            {/* {renderNode(Icon, rightIcon)} */}
          </View>
        )}
      </Animated.View>

      {!!errorMessage && (
        <Text {...errorProps} style={StyleSheet.flatten([errorStyle && errorStyle])}>
          {errorMessage}
        </Text>
      )}
    </View>
  );
};

export default Input;
