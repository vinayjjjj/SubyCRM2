import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const p = await prisma.platform.findFirst({
    where: { platformId: { contains: "17133228548108" } }
  });
  console.log("Looking for 17133228548108:", p);
  
  const platforms = await prisma.platform.findMany({
    where: { type: "whatsapp" }
  });
  console.log("Sample whatsapp platforms:");
  console.log(platforms.slice(0, 5));
  process.exit(0);
}
run();
