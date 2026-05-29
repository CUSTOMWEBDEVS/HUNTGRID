const toastHost = document.getElementById('toastHost');
const bottomSheet = document.getElementById('bottomSheet');
const sheetOverlay = document.getElementById('sheetOverlay');
const sheetContent = document.getElementById('sheetContent');
const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalFields = document.getElementById('modalFields');
const modalCancel = document.getElementById('modalCancel');
const modalConfirm = document.getElementById('modalConfirm');

/** Show a short user-visible toast. */
export function toast(message, type = 'info', timeout = 3300) {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  toastHost.appendChild(node);
  setTimeout(() => node.remove(), timeout);
}

/** Trigger light haptic feedback where supported. */
export function vibrate(pattern = 30) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

/** Open the reusable bottom sheet. */
export function openSheet(htmlOrNode) {
  sheetContent.replaceChildren();
  if (typeof htmlOrNode === 'string') sheetContent.innerHTML = htmlOrNode;
  else sheetContent.appendChild(htmlOrNode);
  bottomSheet.hidden = false;
  sheetOverlay.hidden = false;
}

/** Close the reusable bottom sheet. */
export function closeSheet() {
  bottomSheet.hidden = true;
  sheetOverlay.hidden = true;
  sheetContent.replaceChildren();
}

/** Build a real modal confirmation. */
export function confirmModal({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', fields = [] }) {
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalFields.replaceChildren();
  const fieldRefs = {};
  for (const field of fields) {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
    input.className = 'input';
    if (field.type !== 'textarea') input.type = field.type || 'text';
    input.value = field.value || '';
    input.placeholder = field.placeholder || '';
    if (field.required) input.required = true;
    label.appendChild(input);
    modalFields.appendChild(label);
    fieldRefs[field.name] = input;
  }
  modalConfirm.textContent = confirmText;
  modalCancel.textContent = cancelText;
  modalOverlay.hidden = false;
  return new Promise(resolve => {
    const cleanup = value => {
      modalOverlay.hidden = true;
      modalCancel.onclick = null;
      modalConfirm.onclick = null;
      resolve(value);
    };
    modalCancel.onclick = () => cleanup(null);
    modalConfirm.onclick = () => {
      const values = {};
      for (const [key, input] of Object.entries(fieldRefs)) {
        if (input.required && !input.value.trim()) {
          toast('Required field missing', 'error');
          return;
        }
        values[key] = input.value.trim();
      }
      cleanup(values);
    };
  });
}

/** Switch primary SPA views. */
export function switchView(viewId) {
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === viewId));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewId));
}

/** Build a compact empty state. */
export function emptyState(message, buttonText, onClick) {
  const node = document.createElement('div');
  node.className = 'empty';
  const p = document.createElement('p');
  p.textContent = message;
  node.appendChild(p);
  if (buttonText) {
    const button = document.createElement('button');
    button.className = 'button';
    button.type = 'button';
    button.textContent = buttonText;
    button.onclick = onClick;
    node.appendChild(button);
  }
  return node;
}

sheetOverlay.addEventListener('click', closeSheet);
let touchStart = 0;
bottomSheet.addEventListener('touchstart', event => touchStart = event.touches[0].clientY, { passive: true });
bottomSheet.addEventListener('touchend', event => {
  const end = event.changedTouches[0].clientY;
  if (end - touchStart > 80) closeSheet();
}, { passive: true });
