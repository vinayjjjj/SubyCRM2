import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const msgs = await prisma.inboxMessage.findMany({
    where: { 
      OR: [
        { senderId: { contains: "8958695497" } },
        { externalId: { contains: "8958695497" } }
      ]
    }
  });
  console.log("Messages from 8958695497 now:", JSON.stringify(msgs, null, 2));

  process.exit(0);
}
run();
