import React, { useRef, useState, useEffect } from 'react';
import { Camera, Upload, Loader2, AlertCircle, X } from 'lucide-react';
import { NeuralModal } from './NeuralModal';
import { NeuralButton } from './NeuralButton';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

export interface ImageCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string, mimeType: string, fileName: string) => Promise<void>;
  isAnalyzing: boolean;
  themeColor: 'emerald' | 'indigo' | 'orange' | 'cyan' | 'amber';
  title: string;
  acceptedTypes?: string;
  maxFileSizeMb?: number;
}

type CaptureMode = 'select' | 'camera' | 'preview';

interface CameraError {
  code: string;
  message: string;
  name?: string;
}

export function ImageCaptureModal({
  isOpen,
  onClose,
  onCapture,
  isAnalyzing,
  themeColor,
  title,
  acceptedTypes = 'image/jpeg,image/png',
  maxFileSizeMb = 10
}: ImageCaptureModalProps) {
  const [mode, setMode] = useState<CaptureMode>('select');
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [previewMimeType, setPreviewMimeType] = useState<string>('');
  const [previewFileName, setPreviewFileName] = useState<string>('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reducedMotion = useReducedMotion();

  const accentColors: Record<typeof themeColor, { button: string; border: string; glow: string }> = {
    emerald: { button: 'bg-emerald-600 hover:bg-emerald-500', border: 'border-emerald-400/30', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.3)]' },
    indigo: { button: 'bg-indigo-600 hover:bg-indigo-500', border: 'border-indigo-400/30', glow: 'shadow-[0_0_20px_rgba(99,102,241,0.3)]' },
    orange: { button: 'bg-orange-600 hover:bg-orange-500', border: 'border-orange-400/30', glow: 'shadow-[0_0_20px_rgba(234,88,12,0.3)]' },
    cyan: { button: 'bg-cyan-600 hover:bg-cyan-500', border: 'border-cyan-400/30', glow: 'shadow-[0_0_20px_rgba(34,211,238,0.3)]' },
    amber: { button: 'bg-amber-600 hover:bg-amber-500', border: 'border-amber-400/30', glow: 'shadow-[0_0_20px_rgba(217,119,6,0.3)]' }
  };
  const accentColor = accentColors[themeColor];

  // Cleanup stream on unmount or when closing
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        setCameraStream(null);
      }
      setMode('select');
      setPreviewDataUrl('');
      setCameraError(null);
    }
  }, [isOpen, cameraStream]);

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // Check file size
    const maxBytes = maxFileSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      return { valid: false, error: `File exceeds ${maxFileSizeMb}MB limit. Your file: ${(file.size / 1024 / 1024).toFixed(1)}MB` };
    }

    // Check file type
    const acceptedArray = acceptedTypes.split(',').map(t => t.trim());
    if (!acceptedArray.includes(file.type)) {
      return { valid: false, error: `File type not supported. Accepted: ${acceptedArray.join(', ')}` };
    }

    // Check file name
    if (!file.name || file.name.trim().length === 0) {
      return { valid: false, error: 'File name is invalid' };
    }

    return { valid: true };
  };

  const handleFileSelect = async (file: File) => {
    setFileError(null);
    const validation = validateFile(file);
    if (!validation.valid) {
      setFileError(validation.error || 'Invalid file');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onerror = () => {
        setFileError('Failed to read file. Please try again.');
      };
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) {
          setFileError('Failed to process file. Please try again.');
          return;
        }
        setPreviewDataUrl(dataUrl);
        setPreviewMimeType(file.type);
        setPreviewFileName(file.name);
        setMode('preview');
        setFileError(null);
        setCameraError(null);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setFileError('An error occurred while reading the file.');
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset input so same file can be selected again
    e.currentTarget.value = '';
  };

  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setCameraStream(stream);
      setMode('camera');

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => {
          console.error('Video play failed:', e);
          setCameraError({ code: 'PLAY_FAILED', message: 'Failed to play video stream' });
        });
      }
    } catch (error: unknown) {
      const err = error as CameraError | { name?: string; message?: string };
      let message = 'Camera access denied';
      if (err.name === 'NotAllowedError') message = 'Camera permission denied';
      if (err.name === 'NotFoundError') message = 'No camera device found';
      setCameraError({ code: err.name || 'UNKNOWN', message });
    }
  };

  const handleCapturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const context = canvasRef.current.getContext('2d');
    if (!context) return;

    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);

    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.85);
    setPreviewDataUrl(dataUrl);
    setPreviewMimeType('image/jpeg');
    setPreviewFileName(`photo-${Date.now()}.jpg`);

    // Stop stream
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }

    setMode('preview');
  };

  const handleRetake = () => {
    if (cameraError) {
      setCameraError(null);
      setMode('select');
    } else {
      // Restart camera
      startCamera();
    }
  };

  const handleUseImage = async () => {
    await onCapture(previewDataUrl, previewMimeType, previewFileName);
  };

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      themeColor={themeColor}
      maxWidth="2xl"
    >
      <div className="space-y-6">
        {mode === 'select' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <NeuralButton
                variant="secondary"
                size="lg"
                className={cn('flex flex-col items-center justify-center gap-3 h-32', accentColor.button, accentColor.glow)}
                onClick={startCamera}
              >
                <Camera className="w-8 h-8" />
                <span className="text-sm">Take Photo</span>
              </NeuralButton>

              <NeuralButton
                variant="secondary"
                size="lg"
                className={cn('flex flex-col items-center justify-center gap-3 h-32', accentColor.button, accentColor.glow)}
                onClick={handleUploadClick}
              >
                <Upload className="w-8 h-8" />
                <span className="text-sm">Upload Image</span>
              </NeuralButton>

              <input
                ref={fileInputRef}
                type="file"
                accept={acceptedTypes}
                onChange={handleFileInputChange}
                className="hidden"
                aria-hidden="true"
              />
            </div>

            {fileError && (
              <div
                className="bg-red-950/30 border border-red-500/30 rounded-xl p-4 flex items-start gap-3"
                role="alert"
                aria-live="polite"
                aria-atomic="true"
              >
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-300 text-sm">{fileError}</p>
              </div>
            )}
          </>
        )}

        {mode === 'camera' && (
          <div className="space-y-4">
            {cameraError ? (
              <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-400 text-sm font-semibold">{cameraError.message}</p>
                  <p className="text-red-300/60 text-xs mt-1">Try uploading an image instead</p>
                </div>
              </div>
            ) : (
              <>
                <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  {/* Corner bracket viewfinder overlay */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-4 left-4 w-8 h-8 border-2 border-emerald-400/60"></div>
                    <div className="absolute top-4 right-4 w-8 h-8 border-2 border-emerald-400/60" style={{ borderTop: 'inherit', borderRight: 'inherit' }}></div>
                    <div className="absolute bottom-4 left-4 w-8 h-8 border-2 border-emerald-400/60" style={{ borderBottom: 'inherit', borderLeft: 'inherit' }}></div>
                    <div className="absolute bottom-4 right-4 w-8 h-8 border-2 border-emerald-400/60" style={{ borderBottom: 'inherit', borderRight: 'inherit' }}></div>
                  </div>
                </div>
                <NeuralButton
                  variant="primary"
                  size="lg"
                  className={cn('w-full', accentColor.button)}
                  onClick={handleCapturePhoto}
                >
                  Capture Photo
                </NeuralButton>
              </>
            )}

            <NeuralButton
              variant="ghost"
              size="md"
              className="w-full"
              onClick={handleRetake}
            >
              Back
            </NeuralButton>
          </div>
        )}

        {mode === 'preview' && (
          <div className="space-y-4">
            <div className="bg-black rounded-xl overflow-hidden">
              <img
                src={previewDataUrl}
                alt="Preview"
                className="w-full h-auto max-h-96 object-contain"
              />
            </div>

            <div className="space-y-3">
              <NeuralButton
                variant="primary"
                size="lg"
                className={cn('w-full', accentColor.button)}
                onClick={handleUseImage}
                disabled={isAnalyzing}
                aria-busy={isAnalyzing}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Use This Image'
                )}
              </NeuralButton>

              <NeuralButton
                variant="ghost"
                size="md"
                className="w-full"
                onClick={handleRetake}
                disabled={isAnalyzing}
              >
                Retake
              </NeuralButton>
            </div>
          </div>
        )}
      </div>

      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} className="hidden" />
    </NeuralModal>
  );
}
