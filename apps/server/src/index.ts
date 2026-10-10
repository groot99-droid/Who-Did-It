import { createServer } from './server';

const port = Number(process.env.PORT ?? 2567);
await createServer().listen(port);
console.log(`[wdi] server listening on :${port}`);
