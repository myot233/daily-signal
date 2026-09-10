import { sqlite } from './infrastructure/database/client';
sqlite.close();
console.log('Drizzle migrations applied.');
