import type {
  CloudAssetRecord,
  CloudProjectRecord,
  CloudProjectSummary,
  CompleteUploadRequest,
  UploadUrlRequest,
  UploadUrlResponse
} from "@acs/cloud-schema";
import type { Project } from "@acs/project-schema";
import type { ProviderMode } from "./runtime";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  displayName: string | null;
}

export interface AuthProvider {
  readonly id: string;
  readonly mode: ProviderMode;
  getUserFromToken(token: string): Promise<AuthenticatedUser>;
}

export interface CreateProjectRecordInput {
  name: string;
  templateId: string;
  templateVersion: number;
  design: Project;
}

export interface ProjectStore {
  readonly id: string;
  readonly mode: ProviderMode;
  list(ownerId: string): Promise<CloudProjectSummary[]>;
  get(ownerId: string, projectId: string): Promise<CloudProjectRecord>;
  create(ownerId: string, input: CreateProjectRecordInput): Promise<CloudProjectRecord>;
  save(
    ownerId: string,
    record: CloudProjectRecord,
    expectedUpdatedAt?: string | null
  ): Promise<CloudProjectRecord>;
  remove(ownerId: string, projectId: string): Promise<void>;
  duplicate(ownerId: string, projectId: string): Promise<CloudProjectRecord>;
}

export interface ObjectStorageProvider {
  readonly id: string;
  readonly mode: ProviderMode;
  createUploadUrl(ownerId: string, request: UploadUrlRequest): Promise<UploadUrlResponse>;
  completeUpload(ownerId: string, request: CompleteUploadRequest): Promise<CloudAssetRecord>;
  remove(ownerId: string, assetId: string): Promise<void>;
}
