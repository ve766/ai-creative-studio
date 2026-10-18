"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectSummary } from "@acs/project-schema";
import { getTemplate } from "@acs/template-library";
import { downloadText } from "@/lib/export";
import { getProjectRepository } from "@/lib/project-repo";

export interface ProjectListProps {
  limit?: number;
  showImport?: boolean;
}

export function ProjectList({ limit, showImport = false }: ProjectListProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [usedBytes, setUsedBytes] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(() => {
    const repository = getProjectRepository();
    setProjects(repository.list());
    setUsedBytes(repository.usedBytes());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visible = limit ? projects.slice(0, limit) : projects;

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(`确定删除项目「${name}」吗？该操作不可撤销。`)) return;
    try {
      getProjectRepository().remove(id);
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    }
  };

  const handleDuplicate = (id: string) => {
    try {
      getProjectRepository().duplicate(id);
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "复制失败");
    }
  };

  const handleExport = (id: string, name: string) => {
    const json = getProjectRepository().exportJson(id);
    if (!json) {
      setMessage("项目不存在或已损坏");
      return;
    }
    downloadText(json, `${name.replace(/[\\/:*?"<>|]+/g, "_")}-project.json`);
  };

  const handleImport = async (file: File) => {
    setMessage(null);
    try {
      const text = await file.text();
      const result = getProjectRepository().importJson(text);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      refresh();
      setMessage(`已导入项目「${result.project.name}」`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败");
    }
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      {message ? (
        <div className="notice notice-info">
          {message}
          <button type="button" className="icon-btn" style={{ float: "right" }} onClick={() => setMessage(null)}>
            ✕
          </button>
        </div>
      ) : null}

      {showImport ? (
        <div className="row wrap">
          <button type="button" className="btn btn-sm" onClick={() => importRef.current?.click()}>
            导入项目 JSON
          </button>
          <span className="faint" style={{ fontSize: 12 }}>
            本地已用约 {(usedBytes / 1024).toFixed(0)} KB
          </span>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImport(file);
              event.target.value = "";
            }}
          />
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="empty-state">
          <p style={{ marginBottom: 12 }}>还没有项目</p>
          <Link href="/templates" className="btn btn-primary">
            从模板库开始设计
          </Link>
        </div>
      ) : (
        <div className="grid grid-cards">
          {visible.map((project) => {
            const template = getTemplate(project.templateId);
            return (
              <article key={project.id} className="card">
                <div className="card-body stack" style={{ gap: 8 }}>
                  <div className="row-between">
                    <h3 style={{ fontSize: 14.5 }}>{project.name}</h3>
                    <span className="badge">{project.layerCount} 图层</span>
                  </div>
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    {template ? template.name : project.templateId} · v{project.templateVersion}
                    <br />
                    更新于 {new Date(project.updatedAt).toLocaleString("zh-CN")}
                  </p>
                  <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                    <Link href={`/editor/${project.id}`} className="btn btn-sm btn-primary">
                      打开编辑
                    </Link>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => handleDuplicate(project.id)}
                    >
                      复制
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => handleExport(project.id, project.name)}
                    >
                      导出 JSON
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(project.id, project.name)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
