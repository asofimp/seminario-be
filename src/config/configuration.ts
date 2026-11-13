import { PRESENTER_KEYS } from './presenter-keys';

export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  mongodb: {
    uri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017',
    dbName: process.env.MONGODB_DB_NAME ?? 'seminario',
    username: process.env.MONGODB_USERNAME || undefined,
    password: process.env.MONGODB_PASSWORD || undefined,
  },
  adminApiKey: process.env.ADMIN_API_KEY ?? 'change-me',
  // Claves de los presentadores por fase (constante, ver presenter-keys.ts).
  presenterKeys: PRESENTER_KEYS,
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
});
