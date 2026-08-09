import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register Service Worker for PWA support (Module 13)
if ('serviceWorker' in navigator) {
  let refreshing = false;
  // Automatically reload page when a new service worker takes control
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  window.addEventListener('load', () => {
    const baseUrl = ((import.meta as any).env?.BASE_URL || './');
    const swUrl = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}sw.js`;
    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        console.log('[Greed Island PWA] ServiceWorker registered with scope:', registration.scope);

        // Check for updates on load
        registration.update();

        // Check for service worker updates
        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('[Greed Island PWA] New version installed; auto-activating.');
                  // Tell newly installed worker to skip waiting and activate immediately
                  installingWorker.postMessage({ type: 'SKIP_WAITING' });
                } else {
                  console.log('[Greed Island PWA] Content is cached for offline use.');
                }
              }
            };
          }
        };
      })
      .catch((err) => {
        console.warn('[Greed Island PWA] ServiceWorker registration failed:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
