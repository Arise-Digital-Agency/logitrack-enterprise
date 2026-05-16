import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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

const pickMimeType = () => {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "video/webm";
};

export const useScreenCapture = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  const stopTimer = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const cleanup = useCallback(() => {
    stopTimer();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
    setElapsed(0);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const takeScreenshot = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Screen capture isn't supported in this browser.");
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];

      // Prefer ImageCapture when available
      const ICtor = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> } }).ImageCapture;
      if (ICtor) {
        const capture = new ICtor(track);
        const bitmap = await capture.grabFrame();
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
        const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
        triggerDownload(blob, `LogiTrack-screenshot-${stamp()}.png`);
      } else {
        // Fallback via <video>
        const video = document.createElement("video");
        video.srcObject = stream;
        await video.play();
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")!.drawImage(video, 0, 0);
        const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
        triggerDownload(blob, `LogiTrack-screenshot-${stamp()}.png`);
      }
      toast.success("Screenshot saved");
    } catch (err: any) {
      if (err?.name !== "NotAllowedError") toast.error(err?.message ?? "Screenshot failed");
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording) return true;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Screen recording isn't supported in this browser.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        triggerDownload(blob, `LogiTrack-recording-${stamp()}.${ext}`);
        cleanup();
        toast.success("Recording saved");
      };

      stream.getVideoTracks()[0].addEventListener("ended", () => {
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      });

      recorder.start(1000);
      startedAtRef.current = Date.now();
      setIsRecording(true);
      tickRef.current = window.setInterval(
        () => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)),
        500,
      );
      toast.success("Recording started");
      return true;
    } catch (err: any) {
      cleanup();
      if (err?.name !== "NotAllowedError") toast.error(err?.message ?? "Could not start recording");
      return false;
    }
  }, [cleanup, isRecording]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    stopTimer();
  }, []);

  return { isRecording, elapsed, takeScreenshot, startRecording, stopRecording };
};
