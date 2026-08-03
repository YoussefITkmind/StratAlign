import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

export class PrismaService extends PrismaClient {
  constructor(connectionString: string) {
    const adapter = new PrismaPg({
      connectionString,
    });

    super({
      adapter,
    });
  }

  async connect(): Promise<void> {
    await this.$connect();
  }

  async disconnect(): Promise<void> {
    await this.$disconnect();
  }
}