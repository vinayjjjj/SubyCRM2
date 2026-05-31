import { ContactDetailView } from "./contact-detail-view";

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <ContactDetailView paramsPromise={params} />;
}
