export interface PublishToWebOptions {
  passwordProtected: boolean;
  password: string;
  expiresInDays: number;
}

export const DEFAULT_PUBLISH_OPTIONS: PublishToWebOptions = {
  passwordProtected: false,
  password: '',
  expiresInDays: 0,
};

export interface PublishFeatureEntitlements {
  publishPrivateLink: boolean;
}

export const PUBLISH_EXPIRY_OPTIONS = [0, 7, 30, 90] as const;
