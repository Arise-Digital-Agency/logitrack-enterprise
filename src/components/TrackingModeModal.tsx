import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Camera, Circle, Clock, Timer } from "lucide-react";
import { useTracking } from "@/contexts/TrackingContext";

interface TrackingModeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (mode: "standard" | "recording" | "auto-screenshot") => void;
}

export const TrackingModeModal: React.FC<TrackingModeModalProps> = ({ open, onOpenChange, onSelect }) => {
  const { startTracking } = useTracking();

  const handleSelect = async (mode: "standard" | "recording" | "auto-screenshot") => {
    if (mode === "standard") {
      onSelect("standard");
      onOpenChange(false);
      return;
    }

    const success = await startTracking(mode);
    if (success) {
      onSelect(mode);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Select Tracking Mode</DialogTitle>
          <DialogDescription>
            Choose how you want to track your progress for this session.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 pt-4">
          <button
            onClick={() => handleSelect("recording")}
            className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-brand/5 hover:border-brand transition-all text-left group"
          >
            <div className="h-12 w-12 rounded-full bg-brand/10 flex items-center justify-center text-brand group-hover:scale-110 transition-transform">
              <Circle className="h-6 w-6 fill-current" />
            </div>
            <div>
              <p className="font-bold text-foreground">Screen Recording</p>
              <p className="text-xs text-muted-foreground">Record your screen and audio while working.</p>
            </div>
          </button>

          <button
            onClick={() => handleSelect("auto-screenshot")}
            className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-amber-500/5 hover:border-amber-500 transition-all text-left group"
          >
            <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
              <Timer className="h-6 w-6" />
            </div>
            <div>
              <p className="font-bold text-foreground">Auto-Screenshot</p>
              <p className="text-xs text-muted-foreground">Capture a screenshot automatically every 10 minutes.</p>
            </div>
          </button>

          <button
            onClick={() => handleSelect("standard")}
            className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-secondary/80 transition-all text-left group"
          >
            <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground group-hover:scale-110 transition-transform">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="font-bold text-foreground">Standard Tracking</p>
              <p className="text-xs text-muted-foreground">Basic time tracking without media capture.</p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
