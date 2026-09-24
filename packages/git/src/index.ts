export const GitProviderId = {
  GitHub: "github",
  GitLab: "gitlab",
} as const;
export type GitProviderId = (typeof GitProviderId)[keyof typeof GitProviderId] | (string & {});

export interface RepositoryRef {
  readonly owner: string;
  readonly name: string;
}

export const FileOperation = {
  Create: "create",
  Update: "update",
  Delete: "delete",
} as const;
export type FileOperation = (typeof FileOperation)[keyof typeof FileOperation];

export interface FileChange {
  readonly path: string;
  readonly content: string;
  readonly operation: FileOperation;
}

export interface ContributionIdentity {
  readonly principalId: string;
  readonly grantId: string;
  readonly displayName?: string;
}

export const ChangeRequestState = {
  Open: "open",
  Merged: "merged",
  Closed: "closed",
} as const;
export type ChangeRequestState = (typeof ChangeRequestState)[keyof typeof ChangeRequestState];

export interface ChangeRequest {
  readonly id: string;
  readonly url: URL;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly state: ChangeRequestState;
}

export interface SubmitChangeInput {
  readonly repository: RepositoryRef;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly title: string;
  readonly description: string;
  readonly commitMessage: string;
  readonly files: readonly FileChange[];
  readonly contributor: ContributionIdentity;
  readonly idempotencyKey: string;
}

export interface GitProvider {
  readonly id: GitProviderId;
  submitChange(input: SubmitChangeInput): Promise<ChangeRequest>;
  getChangeRequest(repository: RepositoryRef, id: string): Promise<ChangeRequest>;
}

export * from "./editorial";
