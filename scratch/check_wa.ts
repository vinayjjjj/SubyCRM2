import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const sessions = await prisma.$queryRawUnsafe(`SELECT * FROM "contacts"."whatsapp_sessions"`);
  console.log("WhatsApp Sessions in DB:", sessions);
  
  const platforms = await prisma.platform.findMany({
    where: { type: "whatsapp" },
  });
  console.log("WhatsApp Platforms in DB:", platforms.length, platforms.slice(0, 5));
  
  const inboxMessages = await prisma.$queryRawUnsafe(`SELECT * FROM "contacts"."inbox_messages" WHERE platform = 'whatsapp' ORDER BY received_at DESC LIMIT 5`);
  console.log("Recent WhatsApp Messages in DB:", inboxMessages);
  
  process.exit(0);
}
run();
