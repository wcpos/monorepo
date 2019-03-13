import React, { Fragment } from 'react';
import useObservable from '../../hooks/use-observable';
import Checkbox from '../../components/checkbox';
import Loader from '../../components/loader';

interface Props {
  columns: any;
}

const Settings = (props: Props) => {
  const columns = useObservable(props.columns.observeWithColumns(['hide']), []);

  if (!columns) {
    return <Loader />;
  }

  return (
    <Fragment>
      {columns.map((column: any) => (
        <Checkbox
          key={column.key}
          label={column.label}
          checked={!column.hide}
          onChange={() => column.update({ hide: !column.hide })}
        />
      ))}
    </Fragment>
  );
};

export default Settings;

// const enhance = withObservables([], ({ ui }: any) => ({
//   columns: ui.columns.observe(),
//   count: ui.columns.observeCount(),
// }));

// export default enhance(Settings);
