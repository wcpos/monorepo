import { TableSchemaSpec } from '@nozbe/watermelondb/Schema';

const schema: TableSchemaSpec = {
  name: 'uis',
  columns: [
    { name: 'section', type: 'string' },
    { name: 'sortBy', type: 'string' },
    { name: 'sortDirection', type: 'string' },
    // { name: 'columns', type: 'string' },
  ],
};

export default schema;
