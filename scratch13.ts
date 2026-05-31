import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const msgs = await prisma.inboxMessage.findMany({
    where: { 
      contactId: "36e8a74c-15a5-4f92-80a6-aed6c5d29b52",
      platform: "whatsapp"
    },
    orderBy: { receivedAt: "desc" }
  });
  console.log("WhatsApp Messages for Yogesh now:", JSON.stringify(msgs, null, 2));

  process.exit(0);
}
run();
