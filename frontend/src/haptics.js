/** Haptic feedback for scan events. Silently no-ops on unsupported devices. */
export function scanHaptic(type) {
  if (!navigator.vibrate) return;
  switch (type) {
    case 'success':
      navigator.vibrate([50, 30, 50]);
      break;
    case 'error':
      navigator.vibrate([200, 100, 200]);
      break;
    case 'scan':
      navigator.vibrate(30);
      break;
    case 'flagged':
      navigator.vibrate([100, 50, 100]);
      break;
  }
}
