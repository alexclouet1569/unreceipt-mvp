"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Trash2, X } from "lucide-react";
import { ZoomableImage } from "@/components/receipt/ZoomableImage";

// Full-screen view of a receipt photo, to check the details against it
// (DESIGN.md "Photo viewer"). With `onDelete` (the capture sheet, before
// saving) it also offers "Delete photo"; a saved receipt's original is the
// evidence and is never deleted from here.

export function PhotoViewer({
  open,
  onOpenChange,
  src,
  alt,
  title = "Your photo",
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  alt: string;
  title?: string;
  onDelete?: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Popup
          data-testid="photo-viewer"
          className="fixed inset-0 z-[70] flex flex-col bg-[var(--photo-ground)] px-4 transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0 pt-[max(12px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))] text-white outline-none"
        >
          <div className="flex items-center justify-between gap-3 pb-3">
            <DialogPrimitive.Title className="text-[15px] font-bold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close photo"
              className="-mr-2 flex size-11 items-center justify-center rounded-[10px] outline-none focus-visible:ring-3 focus-visible:ring-white/60"
            >
              <X className="size-6" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Pinch or double-tap to zoom, and drag to move around the photo.
          </DialogPrimitive.Description>
          <ZoomableImage src={src} alt={alt} />
          {onDelete ? (
            <button
              type="button"
              onClick={() => {
                onDelete();
                onOpenChange(false);
              }}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-white/40 bg-card text-[14px] font-semibold text-destructive outline-none focus-visible:ring-3 focus-visible:ring-white/60"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete photo
            </button>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
