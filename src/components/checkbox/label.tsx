import React from 'react';
import Text from '../text';
import { LabelWrapper } from './styles';

type Props = {
  label?: React.ReactNode;
  checked?: boolean;
  info?: React.ReactNode;
};

const Label = ({ label, checked, info }: Props) => {
  return (
    <LabelWrapper>
      <Text>{label}</Text>
      <Text>{info}</Text>
    </LabelWrapper>
  );
};

export default Label;
