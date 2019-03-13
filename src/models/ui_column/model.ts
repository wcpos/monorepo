import { field, nochange, immutableRelation } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import Model from '../common';
import i18n from '../../lib/i18n';
import UI from '../ui/model';
import Relation from '@nozbe/watermelondb/Relation';

export default class Column extends Model {
  static table = 'ui_columns';

  static associations: Associations = {
    uis: { type: 'belongs_to', key: 'ui_id' },
  };

  @immutableRelation('uis', 'ui_id') ui!: any;

  @nochange @field('key') key!: string;
  @field('hide') hide!: boolean;
  @field('disableSort') disableSort!: boolean;
  @field('flexGrow') flexGrow?: 0 | 1;
  @field('flexShrink') flexShrink?: 0 | 1;
  @field('width') width?: string;

  get label() {
    return i18n.t('product.column.label.' + this.key);
  }
}
