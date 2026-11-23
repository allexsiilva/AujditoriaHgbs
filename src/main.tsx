import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Override window.alert with a safe, styled HTML toaster to prevent security error blockages in sandboxed iframes
if (typeof window !== 'undefined') {
  // Override window.fetch to automatically resolve absolute API paths into subdirectory relative if running inside a subdirectory
  try {
    const originalFetch = window.fetch;
    const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (!desc || desc.configurable || desc.writable) {
      Object.defineProperty(window, 'fetch', {
        value: function (input: RequestInfo | URL, init?: RequestInit) {
          let resolvedInput = input;
          if (typeof input === 'string') {
            if (input.startsWith('/api.php') || input.startsWith('/api/')) {
              const pathname = window.location.pathname;
              let dirPath = '';
              if (pathname.endsWith('.html') || pathname.endsWith('.php')) {
                dirPath = pathname.substring(0, pathname.lastIndexOf('/') + 1);
              } else {
                dirPath = pathname.endsWith('/') ? pathname : (pathname + '/');
              }
              resolvedInput = dirPath + input.substring(1);
            }
          } else if (input instanceof URL) {
            if (input.origin === window.location.origin) {
              if (input.pathname.startsWith('/api.php') || input.pathname.startsWith('/api/')) {
                const pathname = window.location.pathname;
                let dirPath = '';
                if (pathname.endsWith('.html') || pathname.endsWith('.php')) {
                  dirPath = pathname.substring(0, pathname.lastIndexOf('/') + 1);
                } else {
                  dirPath = pathname.endsWith('/') ? pathname : (pathname + '/');
                }
                input.pathname = dirPath + input.pathname.substring(1);
                resolvedInput = input;
              }
            }
          }
          return originalFetch.call(this, resolvedInput, init);
        },
        writable: true,
        configurable: true
      });
    }
  } catch (e) {
    console.warn('Could not override window.fetch safely:', e);
  }

  window.onerror = function (msg, url, lineNo, columnNo, error) {
    if (msg === 'Script error.' || (typeof msg === 'string' && msg.includes('Script error'))) {
      return true; // Suppress it completely
    }
    return false;
  };

  window.addEventListener('error', (e) => {
    if (e.message === 'Script error.') {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  // ResizeObserver loops
  window.addEventListener('error', (e) => {
    if (e.message && e.message.includes('ResizeObserver loop')) {
      e.stopPropagation();
      e.preventDefault();
    }
  });

  window.alert = function (message) {
    console.log("ALERT INHIBITED FROM CRASHING IFRAME:", message);
    try {
      let alertContainer = document.getElementById('custom-sandboxed-alerts');
      if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'custom-sandboxed-alerts';
        alertContainer.className = 'fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none';
        document.body.appendChild(alertContainer);
      }
      
      const alertEl = document.createElement('div');
      alertEl.className = 'bg-slate-900 text-white px-4 py-3 rounded-lg shadow-xl text-xs font-semibold flex items-center justify-between pointer-events-auto border border-slate-700/50 transition duration-300';
      alertEl.style.cssText = 'box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.3); min-height: 48px;';
      
      const textSpan = document.createElement('span');
      textSpan.className = 'flex-1 pr-2';
      textSpan.textContent = String(message);
      alertEl.appendChild(textSpan);
      
      const closeBtn = document.createElement('button');
      closeBtn.className = 'ml-3 text-slate-400 hover:text-white font-bold text-xs select-none focus:outline-none cursor-pointer';
      closeBtn.textContent = '✕';
      closeBtn.onclick = (e) => {
        e.preventDefault();
        alertEl.remove();
      };
      alertEl.appendChild(closeBtn);
      
      alertContainer.appendChild(alertEl);
      
      // Auto dismiss after 6 seconds
      setTimeout(() => {
        if (alertEl.parentNode) {
          alertEl.remove();
        }
      }, 6000);
    } catch (e) {
      console.warn("Failed to show custom sandboxed alert:", e);
    }
  };

  // Safe Google Translate DOM translation monkeypatch for React 18+ DOM mismatch prevention
  if (typeof Node !== 'undefined' && Node.prototype) {
    const originalRemoveChild = Node.prototype.removeChild;
    Node.prototype.removeChild = function (child) {
      if (child && child.parentNode !== this) {
        if (child.parentNode) {
          try {
            return originalRemoveChild.call(child.parentNode, child);
          } catch (e) {
            console.warn("Bypassed removeChild mismatch error under parent node:", e);
          }
        }
        return child;
      }
      try {
        return originalRemoveChild.apply(this, arguments as any);
      } catch (e) {
        console.warn("Bypassed removeChild standard mismatch error:", e);
        return child;
      }
    };

    const originalInsertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function (newNode, referenceNode) {
      if (referenceNode && referenceNode.parentNode !== this) {
        if (referenceNode.parentNode) {
          try {
            return originalInsertBefore.call(referenceNode.parentNode, newNode, referenceNode);
          } catch (e) {
            console.warn("Bypassed insertBefore mismatch error under parent node:", e);
          }
        }
        return newNode;
      }
      try {
        return originalInsertBefore.apply(this, arguments as any);
      } catch (e) {
        console.warn("Bypassed insertBefore standard mismatch error:", e);
        return newNode;
      }
    };
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
