import { useEffect } from 'react';

const DEFAULT_MESSAGE = '当前有未保存更改，离开页面可能会丢失。';

export function useBeforeUnloadWarning(
  enabled: boolean,
  message: string = DEFAULT_MESSAGE,
) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled, message]);
}