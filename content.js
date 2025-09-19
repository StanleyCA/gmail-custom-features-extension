console.log('Gmail Custom Features Extension - content script loaded');

const processedSenders = new WeakSet();
let scheduled = false;
let observing = false;
let lastRunAt = 0;

const observer = new MutationObserver(() => scheduleWork('mutation'));

const pushState = history.pushState;
if (pushState) {
  history.pushState = function gcfePushState(...args) {
    const result = pushState.apply(this, args);
    scheduleWork('pushState');
    return result;
  };
}

const replaceState = history.replaceState;
if (replaceState) {
  history.replaceState = function gcfeReplaceState(...args) {
    const result = replaceState.apply(this, args);
    scheduleWork('replaceState');
    return result;
  };
}

window.addEventListener('popstate', () => scheduleWork('popstate'), true);
window.addEventListener('hashchange', () => scheduleWork('hashchange'), true);

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', ensureObserver, { once: true });
} else {
  ensureObserver();
}

scheduleWork('initial');

function ensureObserver() {
  if (observing || !document.body) {
    return;
  }

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-hovercard-id', 'email']
  });
  observing = true;
}

function scheduleWork(reason) {
  if (scheduled) {
    return;
  }

  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    runWhenReady(reason);
  });
}

function runWhenReady(reason) {
  const mainArea = document.querySelector('div[role="main"]');
  if (!mainArea) {
    return;
  }

  const now = performance.now();
  if (now - lastRunAt < 120) {
    return;
  }

  lastRunAt = now;
  console.log(`Processing Gmail rows (${reason})`);
  attachSenderHandlers();
}

function attachSenderHandlers() {
  const rows = document.querySelectorAll('tr.zA');
  rows.forEach(row => {
    const spans = row.querySelectorAll('span.yP, span.zF');
    spans.forEach(setupSenderSpan);
  });
}

function setupSenderSpan(span) {
  if (processedSenders.has(span)) {
    return;
  }

  const senderEmail = span.getAttribute('email') || span.getAttribute('email');
  if (!senderEmail) {
    return;
  }

  span.dataset.gcfeSender = senderEmail;
  span.style.cursor = 'pointer';
  processedSenders.add(span);
}

document.addEventListener('mousedown', maybeInterceptPointer, true);
document.addEventListener('mouseup', maybeInterceptPointer, true);
document.addEventListener('click', handleSenderClick, true);

document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.name === 'q') {
    lastRunAt = 0;
  }
}, true);

function maybeInterceptPointer(event) {
  const span = findSenderSpan(event.target);
  if (!span) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function handleSenderClick(event) {
  const span = findSenderSpan(event.target);
  if (!span) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const senderEmail = span.dataset.gcfeSender;
  if (!senderEmail) {
    return;
  }

  triggerSearch(`from:${senderEmail}`);
}

function findSenderSpan(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  const span = target.closest('span[data-gcfe-sender]');
  if (!span) {
    return null;
  }

  const row = span.closest('tr.zA');
  if (!row) {
    return null;
  }

  return span;
}

function triggerSearch(query) {
  const searchInput = document.querySelector('input[name="q"]');
  if (searchInput) {
    searchInput.value = query;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.focus({ preventScroll: false });

    const searchButton = document.querySelector('button[aria-label="Search mail"], button[aria-label="Search Mail"]');
    if (searchButton) {
      setTimeout(() => searchButton.click(), 0);
      console.log(`Search button clicked for query: ${query}`);
      return;
    }

    if (searchInput.form) {
      setTimeout(() => {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        const prevented = !searchInput.form.dispatchEvent(submitEvent);
        if (!prevented) {
          searchInput.form.submit();
        }
      }, 0);
      console.log(`Form submitted for query: ${query}`);
      return;
    }
  }

  const baseUrl = location.href.split('#')[0];
  const searchHash = `#search/${encodeURIComponent(query)}`;
  const targetUrl = `${baseUrl}${searchHash}`;

  if (location.href !== targetUrl) {
    location.href = targetUrl;
  } else {
    location.reload();
  }

  console.log(`Navigated via hash for query: ${query}`);
}
