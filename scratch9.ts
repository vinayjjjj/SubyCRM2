import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const { telegramPersonalService } = await import("./src/server/services/telegram-personal.service");
  const t = await prisma.telegramPersonalSession.findMany();
  for (const s of t) {
    try {
      console.log(`Syncing telegram for ${s.userId}...`);
      const res = await telegramPersonalService.sync(s.userId);
      console.log(`Result:`, res);
    } catch (e: any) {
      console.error(e.message);
    }
  }
  process.exit(0);
}
run();
