import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

const VAPID_PUBLIC_KEY = 'BL9rJDXqSOkX-bSi1XfgrqQxbv0VazOVJfgJPXTqXpC3qC-FZJAKAL8vt2Tb90Nzd2olfpbjv6Py4dKIqSjF79I';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useWebPush() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState(Notification.permission);

  useEffect(() => {
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    }
  };

  const subscribe = async () => {
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p !== 'granted') return false;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      // Send to backend
      await apiFetch('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription.toJSON())
      });
      
      setIsSubscribed(true);
      return true;
    } catch (e) {
      console.error('Failed to subscribe to push notifications', e);
      return false;
    }
  };

  const unsubscribe = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await apiFetch('/api/push/unsubscribe', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        await subscription.unsubscribe();
        setIsSubscribed(false);
      }
    } catch (e) {
      console.error('Failed to unsubscribe', e);
    }
  };

  return { isSubscribed, permission, subscribe, unsubscribe };
}
