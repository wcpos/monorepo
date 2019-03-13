import React, { useState } from 'react';
import { TextInput, NativeSyntheticEvent, TextInputFocusEventData } from 'react-native';

interface Props {
  customer_note: string;
  onUpdate: any;
}

const Note = ({ customer_note, onUpdate }: Props) => {
  const [value, setValue] = useState(customer_note);

  const handleChangeText = (text: string) => {
    setValue(text);
  };

  const handleOnBlur = () => {
    onUpdate({
      customer_note: value,
    });
  };

  return (
    <TextInput
      value={value}
      multiline={true}
      onChangeText={handleChangeText}
      onBlur={handleOnBlur}
    />
  );
};

export default Note;
