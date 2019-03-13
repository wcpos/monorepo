import React from 'react';

import Shared from './shared';

export type Props = {
  label?: React.ReactNode;
  value?: string; // this prop is currently used only on web
  hasError?: boolean;
  disabled?: boolean;
  checked?: boolean;
  name?: string; // this prop is currently used only on web
  info?: React.ReactNode;
  onChange?: () => void;
  children?: React.ReactNode;
};

export default function Checkbox({
  label,
  hasError,
  disabled,
  checked,
  info,
  onChange,
  children,
}: Props) {
  return (
    <Shared
      label={label}
      hasError={hasError}
      disabled={disabled}
      checked={checked}
      info={info}
      onPress={onChange}
    >
      {children}
    </Shared>
  );
}
