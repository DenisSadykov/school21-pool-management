import { useEffect, useState } from 'react';

function readIsMobile() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(max-width: 768px)').matches;
}

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(readIsMobile);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (event) => setIsMobile(event.matches);

    setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
