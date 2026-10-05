import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

app.listen(env.port);

console.log(`Warphub API is running at http://127.0.0.1:${env.port}`);

export type App = typeof app;
