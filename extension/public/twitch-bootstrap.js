window.__VAULT_SURGE_AUTH_LISTENERS__ = [];

if (window.Twitch && window.Twitch.ext) {
  window.Twitch.ext.onAuthorized(function (authorization) {
    window.__VAULT_SURGE_AUTHORIZATION__ = authorization;
    window.__VAULT_SURGE_AUTH_LISTENERS__.forEach(function (listener) {
      listener(authorization);
    });
  });
}
