import Model from './model';

export interface MetaDatumProps {
  id?: number;
  key: string;
  value: string;
}

export type MetaDataProps = MetaDatumProps[];

export { Model };
export default Model;
