import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Fetching all contacts in DB...");
  const contacts = await prisma.contact.findMany({
    include: {
      platforms: true,
    }
  });
  console.log(`Total contacts: ${contacts.length}`);
  console.log("Contacts list:");
  contacts.forEach(c => {
    console.log(`- ID: ${c.id}, Name: ${c.name}, Company: ${c.company}, Role: ${c.role}`);
    c.platforms.forEach(p => {
      console.log(`   * Platform: ${p.type}, ID: ${p.platformId}, DisplayName: ${p.displayName}`);
    });
  });

  const query = "Stripe";
  console.log(`\nTesting search query: "${query}"`);
  const terms = query.trim().split(/\s+/).filter(Boolean);
  const whereAnd = terms.map((term) => ({
    OR: [
      { name: { contains: term, mode: "insensitive" as const } },
      { company: { contains: term, mode: "insensitive" as const } },
      { role: { contains: term, mode: "insensitive" as const } },
      {
        platforms: {
          some: {
            OR: [
              { platformId: { contains: term, mode: "insensitive" as const } },
              { displayName: { contains: term, mode: "insensitive" as const } },
            ],
          },
        },
      },
    ],
  }));

  const results = await prisma.contact.findMany({
    where: {
      AND: whereAnd,
    },
    include: {
      platforms: true,
    }
  });

  console.log(`Found ${results.length} search results:`);
  results.forEach(c => {
    console.log(`- ${c.name} (${c.company})`);
  });
}

main()
  .catch(err => {
    console.error("Error running test:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
