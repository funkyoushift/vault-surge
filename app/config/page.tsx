import { ExtensionInstallInfo } from "../../components/extension-install-info";

export default function ConfigExtensionPage() {
  return (
    <ExtensionInstallInfo
      downloadUrl={process.env.VAULT_SURGE_DOWNLOAD_URL}
    />
  );
}
