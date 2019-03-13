import { sync } from './index';
import database from '../database';
import Customer from '../models/customer/model';

const customerCollection = database.collections.get('customers');

export const batchAddCustomers = async (data: any[]) => {
  const batch = data.map((data: any) => {
    return customerCollection.prepareCreate((customer: Customer) => {
      customer.remote_id = data.id;
      customer.date_created = data.date_created;
      customer.date_created_gmt = data.date_created_gmt;
      customer.date_modified = data.date_modified;
      customer.date_modified_gmt = data.date_modified_gmt;
      customer.email = data.email;
      customer.first_name = data.first_name;
      customer.last_name = data.last_name;
      customer.role = data.role;
      customer.username = data.username;
      customer.password = data.password;
      customer.billing = data.billing;
      customer.shipping = data.shipping;
      customer.is_paying_customer = data.is_paying_customer;
      customer.avatar_url = data.avatar_url;
      customer.meta_data = data.meta_data;
    });
  });
  return await database.action(async () => await database.batch(...batch));
};

export async function syncCustomers() {
  const fetch$ = await sync('customers');
  fetch$.subscribe((data: any) => {
    batchAddCustomers(data);
  });
}
