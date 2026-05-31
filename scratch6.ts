import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const c = await prisma.contact.findMany({
    where: { name: { contains: "yogesh", mode: "insensitive" } },
    include: { platforms: true }
  });
  console.log("Contact Yogesh:", JSON.stringify(c, null, 2));

  const p = await prisma.platform.findMany({
    where: { platformId: { contains: "8958695497" } },
    include: { contact: true }
  });
  console.log("Platforms with 8958695497:", JSON.stringify(p, null, 2));

  const msgs = await prisma.inboxMessage.findMany({
    where: { 
      OR: [
        { senderId: { contains: "8958695497" } },
        { externalId: { contains: "8958695497" } }
      ]
    }
  });
  console.log("Messages from 8958695497:", JSON.stringify(msgs, null, 2));

  process.exit(0);
}
run();
