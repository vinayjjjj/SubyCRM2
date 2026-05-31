import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const contacts = await prisma.contact.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { platforms: true }
  });
  console.log(JSON.stringify(contacts, null, 2));
  process.exit(0);
}
run();
