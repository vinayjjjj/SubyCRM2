import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const t = await prisma.telegramPersonalSession.findMany();
  console.log("Telegram sessions:", t.map(s => s.userId));
  process.exit(0);
}
run();
