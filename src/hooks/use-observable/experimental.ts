// import { useState, useEffect } from 'react';
// import oldUseObservable from './use-observable';

import { Subject, Subscription } from 'rxjs';
import { useEffect, useMemo, useState } from 'react';

export default function useObservable(observable: any, initial?: any, inputs: any[] = []) {
  const [state, setState] = useState(initial);
  const subject = useMemo(() => new Subject(), inputs);

  useEffect(() => {
    const subscription = new Subscription();
    subscription.add(subject);
    subscription.add(subject.pipe(() => observable).subscribe(value => setState(value)));
    return () => subscription.unsubscribe();
  }, [subject]);

  return state;
}
