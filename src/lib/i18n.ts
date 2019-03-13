import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  debug: true,

  // have a common namespace used around the full app
  ns: ['common'],
  defaultNS: 'common',

  interpolation: {
    escapeValue: false, // not needed for react as it escapes by default
  },

  // bootstrap
  resources: {
    en: {
      common: {
        product: {
          button: {
            sync: 'Sync Products',
          },
          column: {
            label: {
              actions: 'Actions',
              customer: 'Customer',
              date_created: 'Created',
              id: 'ID',
              image: 'Image',
              name: 'Product',
              note: 'Note',
              number: 'Number',
              price: 'Price',
              qty: 'Qty',
              regular_price: 'Regular Price',
              sale_price: 'Sale Price',
              sku: 'SKU',
              status: 'Status',
              stock: 'Stock',
              total: 'Total',
            },
          },
          search: {
            placeholder: 'Search Products',
            empty: 'Product not found',
          },
          select: {
            placeholder: 'Select...',
            empty: 'Not Found',
            loading: 'Loading',
          },
          showing: 'Showing {{showing}} of {{total}}',
          in_stock: '{{quantity}} in stock',
        },
      },
    },
  },
});

export default i18n;
