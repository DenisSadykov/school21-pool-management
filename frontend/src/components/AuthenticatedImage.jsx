import React, { useEffect, useRef, useState } from 'react';
import { API_URL, getToken } from '../api';

function AuthenticatedImage({ src, alt, onError, ...props }) {
  const [objectUrl, setObjectUrl] = useState('');
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let active = true;
    let nextObjectUrl = '';

    async function load() {
      if (!src) return;
      try {
        const token = getToken();
        const response = await fetch(`${API_URL}${src}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error(`Avatar HTTP ${response.status}`);
        const blob = await response.blob();
        nextObjectUrl = URL.createObjectURL(blob);
        if (active) setObjectUrl(nextObjectUrl);
      } catch (error) {
        if (active && onErrorRef.current) onErrorRef.current(error);
      }
    }

    load();
    return () => {
      active = false;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [src]);

  if (!objectUrl) return null;
  return <img src={objectUrl} alt={alt} {...props} />;
}

export default AuthenticatedImage;
