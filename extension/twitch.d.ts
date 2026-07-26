interface VaultSurgeAuthorization {
  channelId: string;
  clientId: string;
  token: string;
  userId: string;
}

interface Window {
  __VAULT_SURGE_AUTHORIZATION__?: VaultSurgeAuthorization;
  __VAULT_SURGE_AUTH_LISTENERS__?: Array<
    (authorization: VaultSurgeAuthorization) => void
  >;
}
