import { prisma } from "../lib/prisma";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;

export async function runStaleCheck() {
  const now = Date.now();
  console.log("[cron] Running stale contact check...");

  // Degrade hot → warm if no contact in 30 days
  const hotToWarm = await prisma.contact.updateMany({
    where: {
      relationshipStrength: "hot",
      lastContactDate: { lt: new Date(now - THIRTY_DAYS) },
    },
    data: { relationshipStrength: "warm" },
  });

  // Degrade warm → cold if no contact in 60 days
  const warmToCold = await prisma.contact.updateMany({
    where: {
      relationshipStrength: "warm",
      lastContactDate: { lt: new Date(now - SIXTY_DAYS) },
    },
    data: { relationshipStrength: "cold" },
  });

  console.log(`[cron] Stale check done: ${hotToWarm.count} hot→warm, ${warmToCold.count} warm→cold`);
}
