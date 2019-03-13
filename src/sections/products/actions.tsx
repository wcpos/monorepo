import React from 'react';
import { useTranslation } from 'react-i18next';
import TextInput from '../../components/textinput';
import Button from '../../components/button';
import { syncProducts } from '../../actions/product';
import { ActionsView } from './styles';

interface Props {
  onSearch: any;
}

const Actions = ({ onSearch }: Props) => {
  const { t, i18n } = useTranslation();

  return (
    <ActionsView>
      <TextInput
        placeholder={t('product.search.placeholder')}
        onChangeText={onSearch}
        style={{ flex: 1 }}
      />
      <Button title={t('product.button.sync')} onPress={syncProducts} />
    </ActionsView>
  );
};

export default Actions;
