const DEFAULT_SKELETON = {
  baseColor: "#222220",
  highlightColor: "#2e2d2a",
};

export const getSkeletonColors = () => {
  if (typeof document === "undefined") {
    return DEFAULT_SKELETON;
  }

  const style = getComputedStyle(document.documentElement);

  return {
    baseColor:
      style.getPropertyValue("--color-skeleton-base").trim() ||
      DEFAULT_SKELETON.baseColor,
    highlightColor:
      style.getPropertyValue("--color-skeleton-highlight").trim() ||
      DEFAULT_SKELETON.highlightColor,
  };
};
