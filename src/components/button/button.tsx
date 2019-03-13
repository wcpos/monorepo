import React from 'react';
import { GestureResponderEvent } from 'react-native';
import Touchable from '../touchable';
import Text from '../text';

type Props = {
  children?: React.ReactNode;
  title?: string;
  disabled?: boolean;
  loading?: boolean;
  raised?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
};

const Button = ({ children, disabled, title, ...rest }: Props) => {
  return (
    <Touchable disabled={disabled} {...rest}>
      <Text>{title}</Text>
    </Touchable>
  );
};

export default Button;
