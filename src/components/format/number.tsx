import React, { Fragment, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  prefix?: string;
  suffix?: string;
  decimalSeparator?: string;
}

const Name = ({ children, prefix, suffix }: Props) => {
  return (
    <Fragment>
      {prefix} {children} {suffix}
    </Fragment>
  );
};

export default Name;
