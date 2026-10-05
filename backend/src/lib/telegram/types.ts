export type TelegramWebAppUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
};

export type ValidatedInitData = {
  authDate: number;
  user: TelegramWebAppUser;
};

export type JwtPayload = {
  sub: string;
  telegramId: number;
};
