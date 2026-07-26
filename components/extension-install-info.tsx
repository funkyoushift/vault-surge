const OAK2_MOD_MANAGER_URL =
  "https://github.com/bl-sdk/oak2-mod-manager/releases/latest";

type ExtensionInstallInfoProps = {
  downloadUrl?: string;
};

export function ExtensionInstallInfo({
  downloadUrl,
}: ExtensionInstallInfoProps) {
  return (
    <main className="extension-setup-shell">
      <header className="extension-setup-brand">
        <span className="brand-mark">V</span>
        <span>
          <b>VAULT//SURGE</b>
          <small>STREAMER SETUP</small>
        </span>
      </header>

      <section className="extension-setup-card" aria-label="Vault Surge streamer installation">
        <span className="eyebrow">WINDOWS STREAMER APP REQUIRED</span>
        <h1>Finish setup on your PC.</h1>
        <p className="extension-setup-intro">
          Viewers do not install anything. Broadcasters configure effects,
          connect Twitch, and control sessions through the Vault Surge app.
        </p>

        <ol className="extension-setup-steps">
          <li>
            <span>1</span>
            <div>
              <strong>Install the BL4 SDK tools</strong>
              <p>
                Install Oak2 Mod Manager before installing the Vault Surge game
                adapter.
              </p>
              <a href={OAK2_MOD_MANAGER_URL} target="_blank" rel="noreferrer">
                Open Oak2 Mod Manager releases
              </a>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Install Vault Surge</strong>
              <p>
                The desktop app installs the companion and Vault Surge SDK mod,
                then verifies the game integration.
              </p>
              {downloadUrl ? (
                <a href={downloadUrl} target="_blank" rel="noreferrer">
                  Download Vault Surge
                </a>
              ) : (
                <span className="extension-download-pending" aria-disabled="true">
                  Download available before release
                </span>
              )}
            </div>
          </li>
        </ol>

        <aside className="extension-setup-note">
          All gameplay settings are managed locally in the Vault Surge app.
          This Twitch page never stores SDK paths, effect settings, or secrets.
        </aside>
      </section>
    </main>
  );
}
