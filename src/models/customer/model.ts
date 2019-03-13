import Model, { MetaDataProps } from '../common';
import { field, nochange, date, json } from '@nozbe/watermelondb/decorators';
import { BillingProps, ShippingProps } from './';

const sanitizeValues = (json: any) => json || {};

export default class Customer extends Model {
  static table = 'customers';

  @nochange @field('remote_id') remote_id!: number;
  @field('date_created') date_created!: string;
  @date('date_created_gmt') date_created_gmt!: string;
  @date('date_modified') date_modified!: string;
  @date('date_modified_gmt') date_modified_gmt!: string;
  @field('email') email!: string;
  @field('first_name') first_name!: string;
  @field('last_name') last_name!: string;
  @field('role') role!: string;
  @field('username') username!: string;
  @field('password') password!: string;
  @json('billing', sanitizeValues) billing!: BillingProps;
  @json('shipping', sanitizeValues) shipping!: ShippingProps;
  @field('is_paying_customer') is_paying_customer!: boolean;
  @field('avatar_url') avatar_url!: string;
  @json('meta_data', sanitizeValues) meta_data!: MetaDataProps;

  get name() {
    return this.first_name + ' ' + this.last_name;
  }
}
