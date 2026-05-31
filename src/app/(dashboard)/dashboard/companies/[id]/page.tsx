import { CompanyDetailView } from "./company-detail-view";

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <CompanyDetailView paramsPromise={params} />;
}
