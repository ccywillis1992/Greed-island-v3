import React, { useState, useEffect } from 'react';
import { Download, Smartphone, X, CheckCircle2 } from 'lucide-react';
import { Button } from './Button';

export const PWAInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  useEffect(() => {
    // Check if already running in standalone PWA mode
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    setIsStandalone(isStandaloneMode);

    // Detect iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    // Listen for beforeinstallprompt event (Android / Chrome / Desktop)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('[PWA] User accepted install prompt');
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSPrompt(true);
    }
  };

  if (isStandalone || isDismissed) return null;
  if (!deferredPrompt && !isIOS) return null;

  return (
    <div
      id="pwa-install-banner"
      className="mx-auto max-w-2xl my-3 px-4 py-3 bg-[#1c1c1e]/90 border border-purple-500/30 rounded-2xl shadow-xl backdrop-blur-md flex items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top duration-300"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="space-y-0.5">
          <div className="font-semibold text-white text-xs flex items-center gap-1.5">
            <span>Install Greed Island App</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300">
              PWA
            </span>
          </div>
          <p className="text-[11px] text-[#86868b] leading-tight">
            Add to home screen for offline tracking & standalone performance.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          id="pwa-install-btn"
          variant="primary"
          size="sm"
          onClick={handleInstallClick}
          className="gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white border-none py-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install</span>
        </Button>

        <button
          onClick={() => setIsDismissed(true)}
          className="p-1 text-[#86868b] hover:text-white rounded-lg"
          title="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* iOS Instructions Popup */}
      {showIOSPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#1c1c1e] border border-white/10 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-purple-400" />
                <span>Add to Home Screen (iOS)</span>
              </h3>
              <button onClick={() => setShowIOSPrompt(false)} className="text-[#86868b] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="text-xs text-[#f5f5f7] space-y-2.5 list-decimal list-inside leading-relaxed">
              <li>
                Tap the <strong className="text-purple-300">Share button</strong> (box with arrow up) at the bottom of Safari.
              </li>
              <li>
                Scroll down and select <strong className="text-purple-300">"Add to Home Screen"</strong>.
              </li>
              <li>
                Tap <strong className="text-purple-300">"Add"</strong> in the top right corner.
              </li>
            </ol>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowIOSPrompt(false)}
              className="w-full text-xs"
            >
              Got it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
