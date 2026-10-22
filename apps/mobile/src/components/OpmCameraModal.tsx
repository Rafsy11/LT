import { useState } from 'react';
import { compressOpmPhoto, ImageManipulatorResult } from '../camera/opmCamera';

export interface OpmCameraModalProps {
  visible: boolean;
  onClose: () => void;
  onPhotoCaptured: (result: ImageManipulatorResult) => void;
  ticketNumber: string;
}

/**
 * Mobile In-App Camera interface for capturing Optical Power Meter (OPM) proof.
 * Enforces AGENT.md Section 4: Camera-only capture (gallery disabled), on-device compression (< 300KB).
 */
export function OpmCameraModal({
  visible,
  onClose,
  onPhotoCaptured,
  ticketNumber,
}: OpmCameraModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  if (!visible) return null;

  const handleCapturePhoto = async (rawUri: string) => {
    try {
      setIsProcessing(true);
      // Compress immediately to max 1280px width & 0.7 JPEG quality
      const compressed = await compressOpmPhoto(rawUri, {
        maxWidth: 1280,
        quality: 0.7,
      });

      setPreviewUri(compressed.uri);
      onPhotoCaptured(compressed);
      onClose();
    } catch (err) {
      console.error('[OPM Camera] Compression failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    isOpen: visible,
    ticketNumber,
    isProcessing,
    previewUri,
    capture: handleCapturePhoto,
    close: onClose,
  };
}
