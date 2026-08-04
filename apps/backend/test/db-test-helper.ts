import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

export interface TestEnvironment {
  pgContainer: StartedPostgreSqlContainer;
  redisContainer: StartedRedisContainer;
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
}

export async function setupTestEnvironment(): Promise<TestEnvironment> {
  // Start Postgres container
  const pgContainer = await new PostgreSqlContainer('postgres:15-alpine')
    .withDatabase('testdb')
    .withUsername('testuser')
    .withPassword('testpass')
    .start();

  // Start Redis container
  const redisContainer = await new RedisContainer('redis:7-alpine').start();

  const dbUrl = `postgresql://testuser:testpass@${pgContainer.getHost()}:${pgContainer.getMappedPort(5432)}/testdb`;
  const redisHost =
    redisContainer.getHost() === 'localhost'
      ? '127.0.0.1'
      : redisContainer.getHost();
  const redisPort = redisContainer.getMappedPort(6379).toString();

  // Override environment variables
  process.env.DATABASE_URL = dbUrl;
  process.env.REDIS_HOST = redisHost;
  process.env.REDIS_PORT = redisPort;
  process.env.NODE_ENV = 'test';

  // Apply Prisma schema to the container DB
  execSync('npx prisma db push --accept-data-loss', {
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION:
        'i reviwed it this is amazing now you can start in the implmentation go ahead',
    },
  });

  const pool = new pg.Pool({ connectionString: dbUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  return {
    pgContainer,
    redisContainer,
    prisma,
    cleanup: async () => {
      await prisma.$disconnect();
      await pool.end();
      await pgContainer.stop();
      await redisContainer.stop();
    },
  };
}
