export const getFullName = (firstName: string, lastName: string) =>
  [firstName, lastName].filter(Boolean).join(" ").trim();

export const getInitials = (firstName: string, lastName: string) => {
  const initials = [firstName, lastName]
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "?";
};

export const getUserDisplayName = (user?: {
  firstName?: string;
  lastName?: string;
  username?: string;
} | null) => {
  if (!user) return "—";

  const fullName = getFullName(user.firstName ?? "", user.lastName ?? "");

  if (fullName && user.username) return `${fullName} (@${user.username})`;
  if (fullName) return fullName;
  if (user.username) return `@${user.username}`;

  return "—";
};

/** Подпись пользователя из ответов админских API (поля могут быть null) */
export const userLabel = (user?: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
} | null) =>
  getUserDisplayName(
    user
      ? {
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
          username: user.username ?? undefined,
        }
      : null,
  );
