import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const p = await prisma.platform.findMany({
    where: { platformId: { contains: "713" } },
    include: { contact: true }
  });
  console.log("Platforms with 713:", JSON.stringify(p, null, 2));
  process.exit(0);
}
run();
