"use client";

import { useActionState } from "react";
import type { TemplateStatus } from "@prisma/client";

import { Button } from "@/components/buttons";
import { setTemplateStatus, type FormState } from "@/server/admin-service";

export function PublishControls({
  templateId,
  status,
}: {
  templateId: string;
  status: TemplateStatus;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    setTemplateStatus,
    {},
  );

  return (
    <div className="flex flex-col items-end gap-1.5">
      <form action={formAction} className="flex gap-2">
        <input type="hidden" name="templateId" value={templateId} />
        {status === "PUBLISHED" ? (
          <>
            <Button type="submit" name="status" value="DRAFT">
              Unpublish
            </Button>
            <Button type="submit" name="status" value="ARCHIVED">
              Archive
            </Button>
          </>
        ) : (
          <Button type="submit" name="status" value="PUBLISHED" variant="primary">
            Publish
          </Button>
        )}
      </form>
      {state.error ? (
        <p className="text-[12px]" style={{ color: "var(--fail)" }}>
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
