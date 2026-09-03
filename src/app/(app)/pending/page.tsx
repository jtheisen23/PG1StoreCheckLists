import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { PendingQueue } from "@/components/pending-queue";

export const metadata: Metadata = { title: "Waiting to sync" };

export default function PendingPage() {
  return (
    <>
      <PageHeader
        title="Waiting to sync"
        description="Checklists completed on this device that haven't reached the server yet."
      />
      <PendingQueue />
    </>
  );
}
