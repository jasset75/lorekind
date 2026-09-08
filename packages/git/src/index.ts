export type GitProviderId = "github" | "gitlab" | (string & {});

export interface RepositoryRef {
  readonly owner: string;
  readonly name: string;
}

export interface FileChange {
  readonly path: string;
  readonly content: string;
  readonly operation: "create" | "update" | "delete";
}

export interface ContributionIdentity {
  readonly principalId: string;
  readonly grantId: string;
  readonly displayName?: string;
}

export interface ChangeRequest {
  readonly id: string;
  readonly url: URL;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly state: "open" | "merged" | "closed";
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
