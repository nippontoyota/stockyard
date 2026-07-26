import { useState, useEffect } from 'react';

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setPromptEvent(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const promptInstall = () => {
    if (promptEvent) {
      promptEvent.prompt();
      promptEvent.userChoice.then(() => {
        setPromptEvent(null);
      });
    }
  };

  return { isInstallable: !!promptEvent, promptInstall };
}
