import React, { useEffect, useRef, useState } from 'react';
import { pdiQrVin } from '../pdiLogic.js';

export function PdiScanner({ onRead, onClose }) {
  const video = useRef(null);
  const read = useRef(onRead);
  const [error, setError] = useState('');
  read.current = onRead;
  useEffect(() => {
    let cancelled = false;
    let controls;
    let accepted = false;
    const element = video.current;
    async function start() {
      try {
        // The same installed QR decoder used by the yard scanner; no IN/OUT logic.
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (cancelled) return;
        controls = await new BrowserQRCodeReader().decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } }, element,
          result => {
            if (!result || cancelled || accepted) return;
            const vin = pdiQrVin(result.getText());
            if (!vin) { setError('This QR code does not contain a valid VIN. Try another code or enter the VIN.'); return; }
            accepted = true;
            read.current(vin);
          },
        );
        if (cancelled) {
          controls.stop();
          element?.srcObject?.getTracks().forEach(track => track.stop());
        }
      } catch {
        if (!cancelled) setError('Camera unavailable. Allow camera access, or close the camera and enter the VIN.');
      }
    }
    start();
    return () => {
      cancelled = true;
      controls?.stop();
      element?.srcObject?.getTracks().forEach(track => track.stop());
    };
  }, []);
  return <div className="pdi-camera">
    <video ref={video} muted playsInline aria-label="Vehicle QR scanner" />
    <p>Position the vehicle QR code inside the camera view.</p>
    {error && <p role="alert" className="notice bad">{error}</p>}
    <button type="button" onClick={onClose}>Close camera</button>
  </div>;
}
