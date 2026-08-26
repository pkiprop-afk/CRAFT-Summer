import type { Metadata } from "next";
import { DocumentPage } from "@/components/documents/DocumentPage";
import { DOCUMENTS } from "@/lib/references";

export const metadata: Metadata = {
  title: `${DOCUMENTS.proposal.shortTitle} — CRAFT Benchmark`,
  description: DOCUMENTS.proposal.summary,
};

export default function ProposalPage() {
  return <DocumentPage slug="proposal" />;
}
