import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema',
  out: './drizzle',
  dbCredentials: {
    url: process.env.POSTGRES_URI!,
  },
  /** Обходит баг drizzle-kit push с composite PK (postgres.js driver) */
  schemaFilter: ['public'],
});
