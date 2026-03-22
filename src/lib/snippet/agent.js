(function () {
  var currentScript = document.currentScript;

  function getScriptUrl() {
    if (!currentScript || !currentScript.src) {
      return null;
    }

    try {
      return new URL(currentScript.src);
    } catch (error) {
      console.error('[Bress agent] invalid script URL:', error);
      return null;
    }
  }

  function applyActiveActions(origin, clientId) {
    fetch(origin + '/api/active-actions?clientId=' + encodeURIComponent(clientId))
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP error: ' + response.status);
        }
        return response.json();
      })
      .then(function (actions) {
        if (!Array.isArray(actions)) {
          console.error('[Bress agent] actions response is not an array:', actions);
          return;
        }

        actions.forEach(function (action) {
          try {
            if (!action.selector) {
              console.error('[Bress agent] action missing selector:', action);
              return;
            }

            if (action.type === 'replace_text') {
              var element = document.querySelector(action.selector);
              if (!element) {
                console.error('[Bress agent] selector not found:', action.selector);
                return;
              }
              element.textContent = action.value;
              return;
            }

            if (action.type === 'replace_meta') {
              var metaElement = document.querySelector(action.selector);
              if (!metaElement) {
                console.error('[Bress agent] meta selector not found:', action.selector);
                return;
              }
              var attributeName = action.attribute || 'content';
              metaElement.setAttribute(attributeName, action.value);
              return;
            }

            console.error('[Bress agent] unknown action type:', action.type);
          } catch (error) {
            console.error('[Bress agent] action apply error:', action, error);
          }
        });
      })
      .catch(function (error) {
        console.error('[Bress agent] actions fetch error:', error);
      });
  }

  function sendInstallBeacon(origin, token) {
    try {
      var payload = {
        token: token,
        url: location.href,
        hostname: location.hostname,
        title: document.title,
        userAgent: navigator.userAgent,
        vw: window.innerWidth,
        vh: window.innerHeight,
        ts: Date.now(),
      };

      fetch(origin + '/api/snippet/beacon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      })
        .then(function (response) {
          console.log('[Bress agent] beacon response:', response.status);
        })
        .catch(function (error) {
          console.error('[Bress agent] beacon error:', error);
        });
    } catch (error) {
      console.error('[Bress agent] beacon send error:', error);
    }
  }

  function run() {
    try {
      var scriptUrl = getScriptUrl();
      if (!scriptUrl) {
        console.warn('[Bress agent] current script unavailable');
        return;
      }

      var token = scriptUrl.searchParams.get('token');
      if (token) {
        sendInstallBeacon(scriptUrl.origin, token);
        return;
      }

      var clientId = currentScript
        ? currentScript.getAttribute('data-client-id')
        : null;
      if (clientId) {
        applyActiveActions(scriptUrl.origin, clientId);
        return;
      }

      console.warn('[Bress agent] missing token or data-client-id');
    } catch (error) {
      console.error('[Bress agent] init error:', error);
    }
  }

  if (document.readyState === 'complete') {
    run();
  } else {
    window.addEventListener('load', run);
  }
})();
