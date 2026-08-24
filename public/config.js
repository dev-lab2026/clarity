// CLARITY runtime configuration. Values are injected by Docker at container startup.
window.CLARITY_CONFIG = window.CLARITY_CONFIG || {
  entraClientId: '',
  entraTenantId: '',
  appUrl: window.location.origin
};
