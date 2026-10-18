"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProjectFromTemplate, getTemplate } from "@acs/template-library";
import { getProjectRepository } from "@/lib/project-repo";

export interface CreateProjectButtonProps {
  templateId: string;
  label?: string;
  className?: string;
}

export function CreateProjectButton({
  templateId,
  label = "开始设计",
  className = "btn btn-sm btn-primary"
}: CreateProjectButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleClick = () => {
    setError(null);
    const template = getTemplate(templateId);
    if (!template) {
      setError("模板不存在");
      return;
    }
    setBusy(true);
    try {
      const project = createProjectFromTemplate(template);
      getProjectRepository().create(project);
      router.push(`/editor/${project.id}`);
    } catch (createError) {
      setBusy(false);
      setError(createError instanceof Error ? createError.message : "创建项目失败");
    }
  };

  return (
    <span className="stack" style={{ gap: 6 }}>
      <button type="button" className={className} onClick={handleClick} disabled={busy}>
        {busy ? "创建中…" : label}
      </button>
      {error ? (
        <span className="badge badge-danger" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
