import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
const prisma = new PrismaClient();

async function run() {
  const w = await prisma.whatsAppSession.findMany();
  console.log("WhatsApp sessions in DB:", w);
  const authDir = path.join(process.cwd(), "session-whatsapp");
  console.log("session-whatsapp directory exists:", fs.existsSync(authDir));
  if (fs.existsSync(authDir)) {
    console.log("Files in authDir:", fs.readdirSync(authDir).length);
  }
  process.exit(0);
}
run();
