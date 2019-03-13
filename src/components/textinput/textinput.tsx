import React from 'react';
import { TextInputProps } from 'react-native';
import { Wrapper, Input } from './styles';

export type Props = TextInputProps & {
  autosize?: boolean;
  placeholder?: string;
};

const TextInput = ({ ...rest }: Props) => {
  return (
    <Wrapper>
      <Input style={{ width: '20px' }} {...rest} />
    </Wrapper>
  );
};

export default TextInput;
