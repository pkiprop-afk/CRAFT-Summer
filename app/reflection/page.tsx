import type { Metadata } from "next";
import { DocumentPage } from "@/components/documents/DocumentPage";
import { DOCUMENTS } from "@/lib/references";

export const metadata: Metadata = {
  title: `${DOCUMENTS.reflection.shortTitle} — CRAFT Benchmark`,
  description: DOCUMENTS.reflection.summary,
};

export default function ReflectionPage() {
  return <DocumentPage slug="reflection" />;
}
