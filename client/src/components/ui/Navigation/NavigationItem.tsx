import clsx from "clsx";

export default function NavigationItem({
  id,
  icon,
  title,
  isActive,
  onClick,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={clsx(
        "flex flex-col items-center justify-center gap-1 hover:cursor-pointer",
        isActive && "text-accent",
        !isActive && "text-muted"
      )}
    >
      <div className="size-6">{icon}</div>
      <span className="text-xs">{title}</span>
    </button>
  );
}
