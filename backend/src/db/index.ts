import { drizzle } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';
import { env } from '../config/env';
import * as schema from './schema';

const client = new SQL(env.postgresUri);

export const db = drizzle({ client, schema });
