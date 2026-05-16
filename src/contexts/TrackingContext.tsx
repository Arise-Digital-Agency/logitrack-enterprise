import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useScreenCapture } from "@/hooks/useScreenCapture";

type TrackingMode = "standard" | "recording" | "auto-screenshot";

interface TrackingContextType {
  activeMode: TrackingMode;
  isRecording: boolean;
  autoCapture: boolean;
  startTracking: (mode: TrackingMode) => Promise<boolean>;
  stopTracking: () => void;
  takeManualScreenshot: () => void;
}

const TrackingContext = createContext<TrackingContextType | undefined>(undefined);

const AUTO_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export const TrackingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeMode, setActiveMode] = useState<TrackingMode>("standard");
  const [autoCapture, setAutoCapture] = useState(false);
  
  const { isRecording, takeScreenshot, startRecording, stopRecording } = useScreenCapture();
  
  const autoStreamRef = useRef<MediaStream | null>(null);
  const autoIntervalRef = useRef<number | null>(null);

  const stamp = () => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const captureFromStream = useCallback(async () => {
    const stream = autoStreamRef.current;
    if (!stream || !stream.active) {
      stopAutoCapture();
      return;
    }
    try {
      const track = stream.getVideoTracks()[0];
      const video = document.createElement("video");
      video.srcObject = new MediaStream([track]);
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      video.pause();
      video.srcObject = null;
      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
      triggerDownload(blob, `LogiTrack-auto-${stamp()}.png`);
      toast.success(`Auto-screenshot saved`);
    } catch {
      toast.error("Auto-screenshot failed");
    }
  }, []);

  const startAutoCapture = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Screen capture not supported");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      autoStreamRef.current = stream;
      setAutoCapture(true);
      setActiveMode("auto-screenshot");

      stream.getVideoTracks()[0].addEventListener("ended", () => stopAutoCapture());
      setTimeout(() => captureFromStream(), 500);
      autoIntervalRef.current = window.setInterval(() => captureFromStream(), AUTO_INTERVAL_MS);
      toast.success("Auto-capture started — screenshot every 10 min");
      return true;
    } catch (err: any) {
      if (err?.name !== "NotAllowedError") toast.error(err?.message ?? "Could not start auto-capture");
      return false;
    }
  };

  const stopAutoCapture = useCallback(() => {
    if (autoIntervalRef.current) {
      clearInterval(autoIntervalRef.current);
      autoIntervalRef.current = null;
    }
    autoStreamRef.current?.getTracks().forEach((t) => t.stop());
    autoStreamRef.current = null;
    setAutoCapture(false);
    setActiveMode("standard");
  }, []);

  const startTracking = async (mode: TrackingMode) => {
    if (mode === "recording") {
      const success = await startRecording(); // This hook should return success
      if (success) setActiveMode("recording");
      return !!success;
    }
    if (mode === "auto-screenshot") {
      return await startAutoCapture();
    }
    setActiveMode("standard");
    return true;
  };

  const stopTracking = () => {
    if (isRecording) stopRecording();
    if (autoCapture) stopAutoCapture();
    setActiveMode("standard");
  };

  const takeManualScreenshot = () => takeScreenshot();

  useEffect(() => () => {
    if (autoIntervalRef.current) clearInterval(autoIntervalRef.current);
    autoStreamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return (
    <TrackingContext.Provider value={{ activeMode, isRecording, autoCapture, startTracking, stopTracking, takeManualScreenshot }}>
      {children}
    </TrackingContext.Provider>
  );
};

export const useTracking = () => {
  const context = useContext(TrackingContext);
  if (!context) throw new Error("useTracking must be used within a TrackingProvider");
  return context;
};
