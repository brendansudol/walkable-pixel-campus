import { useEffect, useRef } from 'react';

/**
 * Put the prototype folder at public/campus/ so that index.html is available
 * at /campus/index.html. This wrapper receives interaction events from it.
 */
export function CampusWorld({ onInteract }) {
  const frameRef = useRef(null);

  useEffect(() => {
    function handleMessage(event) {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === 'campus:interact') {
        onInteract?.(event.data.hotspot);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onInteract]);

  return (
    <iframe
      ref={frameRef}
      src="/campus/index.html"
      title="Interactive campus map"
      style={{
        display: 'block',
        width: '100%',
        maxWidth: 1000,
        aspectRatio: '1 / 1.16',
        border: 0,
        borderRadius: 24,
        overflow: 'hidden'
      }}
      allow="fullscreen"
    />
  );
}

// Example:
// <CampusWorld onInteract={({ id }) => router.push(`/campus/${id}`)} />
