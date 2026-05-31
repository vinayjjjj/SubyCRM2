import { PrismaClient, type PlatformType, type ReminderStatus } from "@prisma/client";
import { MOCK_COMPANIES } from "../src/lib/mock-companies";
import { MOCK_CONTACTS, MOCK_TAGS } from "../src/lib/mock-contacts";
import { MOCK_REMINDERS } from "../src/lib/mock-reminders";

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

async function main() {
  console.log("[seed] Replacing demo CRM rows...");

  const companyIds = MOCK_COMPANIES.map((company) => company.id);
  const companyNames = MOCK_COMPANIES.map((company) => company.name);
  const contactIds = MOCK_CONTACTS.map((contact) => contact.id);
  const tagIds = MOCK_TAGS.map((tag) => tag.id);
  const tagNames = MOCK_TAGS.map((tag) => tag.name);

  await prisma.$transaction([
    prisma.contact.deleteMany({ where: { id: { in: contactIds } } }),
    prisma.company.deleteMany({
      where: { OR: [{ id: { in: companyIds } }, { name: { in: companyNames } }] },
    }),
    prisma.tag.deleteMany({
      where: { OR: [{ id: { in: tagIds } }, { name: { in: tagNames } }] },
    }),
  ]);

  await prisma.company.createMany({
    data: MOCK_COMPANIES.map((company) => ({
      id: company.id,
      name: company.name,
      domain: company.domain,
      sector: company.sector,
      size: company.size,
      funding: company.funding,
      linkedin: company.linkedin,
      website: company.website,
      description: company.description,
    })),
  });

  const companyIdByName = new Map(MOCK_COMPANIES.map((company) => [company.name, company.id]));

  await prisma.contact.createMany({
    data: MOCK_CONTACTS.map((contact) => ({
      id: contact.id,
      name: contact.name,
      avatar: contact.avatar,
      type: contact.type,
      domain: contact.domain,
      companyId: contact.company ? companyIdByName.get(contact.company) : null,
      company: contact.company,
      role: contact.role,
      relationshipStrength: contact.relationshipStrength,
      aiSummary: contact.aiSummary,
      lastContactDate: toDate(contact.lastContactDate),
      firstContactDate: toDate(contact.firstContactDate),
      contactFrequency: contact.contactFrequency,
    })),
  });

  const platforms = MOCK_CONTACTS.flatMap((contact) =>
    (contact.platforms || []).map((platform) => ({
      id: platform.id,
      contactId: contact.id,
      type: platform.type as PlatformType,
      platformId: platform.platformId,
      displayName: platform.displayName,
      profileUrl: platform.profileUrl,
    })),
  );

  if (platforms.length > 0) {
    await prisma.platform.createMany({ data: platforms });
  }

  const interactions = MOCK_CONTACTS.flatMap((contact) =>
    (contact.interactions || []).map((interaction) => ({
      id: interaction.id,
      contactId: contact.id,
      platform: interaction.platform as PlatformType,
      direction: interaction.direction,
      contentSnippet: interaction.contentSnippet,
      messageCount: interaction.messageCount,
      occurredAt: new Date(interaction.occurredAt),
      createdAt: new Date(interaction.createdAt),
    })),
  );

  if (interactions.length > 0) {
    await prisma.interaction.createMany({ data: interactions });
  }

  const notes = MOCK_CONTACTS.flatMap((contact) =>
    (contact.notes || []).map((note) => ({
      id: note.id,
      contactId: contact.id,
      content: note.content,
      createdAt: new Date(note.createdAt),
      updatedAt: new Date(note.updatedAt),
    })),
  );

  if (notes.length > 0) {
    await prisma.note.createMany({ data: notes });
  }

  await prisma.tag.createMany({
    data: MOCK_TAGS.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      createdAt: new Date(tag.createdAt),
    })),
  });

  await prisma.reminder.createMany({
    data: MOCK_REMINDERS.filter((reminder) => contactIds.includes(reminder.contactId)).map((reminder) => ({
      id: reminder.id,
      contactId: reminder.contactId,
      content: reminder.content,
      dueDate: new Date(reminder.dueDate),
      status: reminder.status as ReminderStatus,
      createdAt: new Date(reminder.createdAt),
    })),
  });

  console.log(
    `[seed] Done: ${MOCK_COMPANIES.length} companies, ${MOCK_CONTACTS.length} contacts, ${platforms.length} platforms, ${interactions.length} interactions, ${notes.length} notes, ${MOCK_TAGS.length} tags, ${MOCK_REMINDERS.length} reminders.`,
  );
}

main()
  .catch((err) => {
    console.error("[seed] Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
