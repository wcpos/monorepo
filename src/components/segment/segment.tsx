import React, { ReactNode } from 'react';
import Text from '../text';
import { SegmentView } from './styles';

export type Props = {
  children?: ReactNode;
  content?: ReactNode;
  kind?: 'body' | 'footer' | 'header';
  type?: 'raised' | 'stacked' | 'piled' | 'vertical' | '';
  disabled?: boolean;
  loading?: boolean;
  raised?: boolean;
};

const Segment: React.FC<Props> = ({ children, content, ...rest }) => {
  let c = content || children;
  if (typeof c === 'string') {
    c = <Text>{children}</Text>;
  }
  return <SegmentView {...rest}>{c}</SegmentView>;
};

export default Segment;
