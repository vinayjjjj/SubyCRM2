import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const p = await prisma.platform.findMany({
    where: { platformId: { contains: "1713322" } }
  });
  console.log("Looking for 1713322:", p);

  const p2 = await prisma.platform.findMany({
    where: { platformId: { contains: "867051" } }
  });
  console.log("Looking for 867051:", p2);
  
  process.exit(0);
}
run();
