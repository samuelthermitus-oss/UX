/* ============================================
   SHARED JS - Viewport Switcher & Utilities
   ============================================ */

// Viewport Switcher
function initViewportSwitcher() {
  const frame = document.querySelector('.vp-frame');
  if (!frame) return;

  const sizes = [
    { label: '1920', cls: 'vp-1920' },
    { label: '1440', cls: 'vp-1440' },
    { label: '1024', cls: 'vp-1024' },
    { label: '768',  cls: 'vp-768'  },
    { label: '375',  cls: 'vp-375'  },
    { label: '320',  cls: 'vp-320'  }
  ];

  const vpWidth = document.getElementById('vp-width');
  const buttons = document.querySelectorAll('.vp-btn[data-size]');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const size = btn.dataset.size;
      frame.className = 'vp-frame vp-' + size;
      if (vpWidth) vpWidth.textContent = size + 'px';
    });
  });

  // Default to full width
  if (vpWidth) vpWidth.textContent = 'Full';
}

// Modal Toggle
function toggleModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
  }
}

// Close modal on backdrop click
function initModals() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initViewportSwitcher();
  initModals();
});
