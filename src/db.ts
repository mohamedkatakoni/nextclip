import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "./generated/prisma/client.js";
import "dotenv/config";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const adapter = new PrismaNeon({ connectionString: url });
export const prisma = new PrismaClient({ adapter });

export async function closeDb(): Promise<void> {
  await prisma.$disconnect();
}