import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canManageTemplates } from "@/lib/permissions";
import { AdminTabs } from "./tabs";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!canManageTemplates(user)) redirect("/");

  return (
    <>
      <AdminTabs />
      {children}
    </>
  );
}
