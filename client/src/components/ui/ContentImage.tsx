import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ImageCrop } from "@/types";

type ContentImageProps = {
  src: string;
  alt: string;
  crop?: ImageCrop | null;
  className?: string;
};

type Size = { width: number; height: number };

export default function ContentImage({
  src,
  alt,
  crop,
  className,
}: ContentImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<Size | null>(null);
  const [loadedMedia, setLoadedMedia] = useState<
    ({ src: string } & Size) | null
  >(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const mediaSize = loadedMedia?.src === src ? loadedMedia : null;
  const hasCrop =
    crop && crop.width > 0 && crop.height > 0 && mediaSize && containerSize;

  let croppedImageStyle: CSSProperties | undefined;

  if (hasCrop && crop && mediaSize && containerSize) {
    const cropWidth = mediaSize.width * (crop.width / 100);
    const cropHeight = mediaSize.height * (crop.height / 100);
    const scale = Math.max(
      containerSize.width / cropWidth,
      containerSize.height / cropHeight,
    );
    const renderedWidth = mediaSize.width * scale;
    const renderedHeight = mediaSize.height * scale;
    const focalX = ((crop.x + crop.width / 2) / 100) * renderedWidth;
    const focalY = ((crop.y + crop.height / 2) / 100) * renderedHeight;

    croppedImageStyle = {
      left: Math.min(
        0,
        Math.max(
          containerSize.width - renderedWidth,
          containerSize.width / 2 - focalX,
        ),
      ),
      top: Math.min(
        0,
        Math.max(
          containerSize.height - renderedHeight,
          containerSize.height / 2 - focalY,
        ),
      ),
      width: renderedWidth,
      height: renderedHeight,
      maxWidth: "none",
    };
  }

  return (
    <div
      ref={containerRef}
      className={clsx("relative overflow-hidden", className)}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(event) => {
          setLoadedMedia({
            src,
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          });
        }}
        style={croppedImageStyle}
        className={clsx(
          "select-none",
          croppedImageStyle
            ? "absolute"
            : "absolute inset-0 size-full object-cover",
        )}
      />
    </div>
  );
}
