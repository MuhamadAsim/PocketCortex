import { useEffect, useState } from 'react';
import { resourceGuard, ResourceGuardState } from '../services/resourceGuard';

export function useResourceGuard(): ResourceGuardState {
  const [state, setState] = useState<ResourceGuardState>(resourceGuard.getState());

  useEffect(() => {
    const unsubscribe = resourceGuard.subscribe(newState => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  return state;
}
