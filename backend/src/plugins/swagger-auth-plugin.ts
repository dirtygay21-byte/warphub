import type { Context } from 'elysia';
import { Elysia } from 'elysia';
import { env } from '../config/env';

function unauthorized(set: Context['set']) {
  set.status = 401;
  set.headers['WWW-Authenticate'] = 'Basic realm="WarpHub API Docs"';
  return 'Unauthorized';
}

function parseBasicAuth(
  header: string | null
): { username: string; password: string } | undefined {
  if (!header?.startsWith('Basic ')) return undefined;

  const decoded = atob(header.slice('Basic '.length));
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return undefined;

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  };
}

function credentialsMatch(username: string, password: string): boolean {
  const expectedUser = env.swaggerUser;
  const expectedPassword = env.swaggerPassword!;

  if (username.length !== expectedUser.length) return false;
  if (password.length !== expectedPassword.length) return false;

  const userMatch = timingSafeEqual(
    Buffer.from(username),
    Buffer.from(expectedUser)
  );
  const passwordMatch = timingSafeEqual(
    Buffer.from(password),
    Buffer.from(expectedPassword)
  );

  return userMatch && passwordMatch;
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isSwaggerPath(path: string): boolean {
  return path === '/swagger' || path.startsWith('/swagger/');
}

function handleSwaggerAuth({
  path,
  request,
  set,
}: {
  path: string;
  request: Request;
  set: Context['set'];
}) {
  if (!env.swaggerPassword) return;
  if (!isSwaggerPath(path)) return;

  const credentials = parseBasicAuth(request.headers.get('authorization'));
  if (
    !credentials ||
    !credentialsMatch(credentials.username, credentials.password)
  ) {
    return unauthorized(set);
  }
}

/** OpenAPI/Swagger с HTTP Basic Auth при заданном SWAGGER_PASSWORD */
export function protectedOpenapiPlugin(openapiPlugin: Elysia) {
  return new Elysia({ name: 'swagger-auth' })
    .onBeforeHandle(handleSwaggerAuth)
    .use(openapiPlugin);
}
