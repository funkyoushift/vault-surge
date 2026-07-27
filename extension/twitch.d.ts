interface VaultSurgeAuthorization {
  channelId: string;
  clientId: string;
  token: string;
  userId: string;
}

interface TwitchBitsProduct {
  sku: string;
  displayName: string;
  cost: { amount: string; type: "bits" };
  inDevelopment?: boolean;
}

interface TwitchBitsTransaction {
  transactionId?: string;
  transactionID?: string;
  transactionReceipt?: string;
  product?: TwitchBitsProduct;
  productSku?: string;
}

interface Window {
  __VAULT_SURGE_AUTHORIZATION__?: VaultSurgeAuthorization;
  __VAULT_SURGE_AUTH_LISTENERS__?: Array<
    (authorization: VaultSurgeAuthorization) => void
  >;
  Twitch?: {
    ext?: {
      features?: {
        isBitsEnabled?: boolean;
      };
      actions?: {
        requestIdShare(): void;
      };
      onAuthorized(callback: (authorization: VaultSurgeAuthorization) => void): void;
      bits?: {
        getProducts(): Promise<TwitchBitsProduct[]>;
        useBits(sku: string): void;
        onTransactionComplete(callback: (transaction: TwitchBitsTransaction) => void): void;
        onTransactionCancelled(callback: () => void): void;
        showBitsBalance?(): void;
        setUseLoopback?(enabled: boolean): void;
      };
    };
  };
}
