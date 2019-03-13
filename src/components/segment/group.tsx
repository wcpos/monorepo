import React, { ReactNode } from 'react';
import { SegmentGroupView } from './styles';

interface Props {
  children: ReactNode;
}

const SegmentGroup = ({ children, ...rest }: Props) => {
  return <SegmentGroupView {...rest}>{children}</SegmentGroupView>;
};

export default SegmentGroup;
