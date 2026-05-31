import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const c = await prisma.contact.findMany({
    where: { name: { contains: "1713322" } },
    include: { platforms: true }
  });
  console.log("Looking for name 1713322:", JSON.stringify(c, null, 2));

  process.exit(0);
}
run();
