export interface AppConfig {
  port: number;
  mongodb: { uri: string };
  redis: { url: string };
  jwt: { secret: string };
  s3: { endpoint: string; accessKey: string; secretKey: string; bucket: string };
}

/** 集中式环境配置（与 .env.example 字段一一对应） */
export const configuration = (): AppConfig => ({
  port: parseInt(process.env.API_PORT ?? '3000', 10),
  mongodb: {
    uri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/personal_os',
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    accessKey: process.env.S3_ACCESS_KEY ?? 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
    bucket: process.env.S3_BUCKET ?? 'personal-os',
  },
});
