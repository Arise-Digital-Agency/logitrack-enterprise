import { Camera, Circle, Square, Timer, TimerOff } from "lucide-react";
import { useTracking } from "@/contexts/TrackingContext";

const fmt = (s: number) => {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

export const CaptureWidget = () => {
  const { activeMode, isRecording, autoCapture, stopTracking, takeManualScreenshot, startTracking } = useTracking();
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

  if (!supported) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-border bg-card/95 backdrop-blur px-2 py-2 shadow-[var(--shadow-elevated)]">
      <button
        onClick={takeManualScreenshot}
        title="Take screenshot"
        className="h-10 w-10 grid place-items-center rounded-full hover:bg-secondary text-foreground transition-colors"
        aria-label="Take screenshot"
      >
        <Camera className="h-4 w-4" />
      </button>

      {/* Auto-capture toggle (Visible if active or available) */}
      {autoCapture ? (
        <button
          onClick={stopTracking}
          title="Stop auto-capture"
          className="h-10 w-10 grid place-items-center rounded-full bg-warning/20 text-warning-foreground hover:bg-warning/30 transition-colors"
          aria-label="Stop auto-capture"
        >
          <TimerOff className="h-4 w-4" />
        </button>
      ) : (
        <button
          onClick={() => startTracking("auto-screenshot")}
          title="Auto-screenshot every 10 min"
          className="h-10 w-10 grid place-items-center rounded-full hover:bg-secondary text-foreground transition-colors"
          aria-label="Start auto-capture"
        >
          <Timer className="h-4 w-4" />
        </button>
      )}

      {isRecording ? (
        <button
          onClick={stopTracking}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90"
          aria-label="Stop recording"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
          <span>Recording...</span>
        </button>
      ) : (
        <button
          onClick={() => startTracking("recording")}
          title="Start screen recording"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-brand text-brand-foreground text-sm font-semibold hover:bg-brand/90"
          aria-label="Start screen recording"
        >
          <Circle className="h-3.5 w-3.5 fill-current" />
          Record
        </button>
      )}
    </div>
  );
};
