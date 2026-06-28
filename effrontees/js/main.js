/* ===========================================
   Effrontées — JavaScript principal
   =========================================== */

// Navigation scroll effect
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 48);
}, { passive: true });

// Mobile menu
const menuToggle = document.getElementById('menuToggle');
const navLinks   = document.getElementById('navLinks');
const spans      = menuToggle.querySelectorAll('span');

function openMenu() {
  navLinks.classList.add('open');
  spans[0].style.cssText = 'transform:rotate(45deg) translate(5px,5px)';
  spans[1].style.cssText = 'opacity:0';
  spans[2].style.cssText = 'transform:rotate(-45deg) translate(5px,-5px)';
  menuToggle.setAttribute('aria-label', 'Fermer le menu');
}
function closeMenu() {
  navLinks.classList.remove('open');
  spans[0].style.cssText = '';
  spans[1].style.cssText = '';
  spans[2].style.cssText = '';
  menuToggle.setAttribute('aria-label', 'Ouvrir le menu');
}

menuToggle.addEventListener('click', () =>
  navLinks.classList.contains('open') ? closeMenu() : openMenu()
);
navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));

// Fade-in on scroll
const io = new IntersectionObserver(
  entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
  { threshold: 0.12 }
);
document.querySelectorAll('.fade-in').forEach(el => io.observe(el));

// Contact form
const form      = document.getElementById('contactForm');
const submitBtn = document.getElementById('submitBtn');

form.addEventListener('submit', e => {
  e.preventDefault();

  let valid = true;
  form.querySelectorAll('[required]').forEach(field => {
    if (!field.value.trim()) {
      field.style.borderColor = '#e05555';
      valid = false;
    }
  });
  if (!valid) return;

  submitBtn.textContent = 'Message envoyé ✓';
  submitBtn.style.background = '#c8d45a';
  submitBtn.style.color = '#0c2b14';
  submitBtn.disabled = true;

  setTimeout(() => {
    submitBtn.textContent = 'Envoyer ma demande';
    submitBtn.style.background = '';
    submitBtn.style.color = '';
    submitBtn.disabled = false;
    form.reset();
  }, 3500);
});

form.querySelectorAll('[required]').forEach(field =>
  field.addEventListener('input', () => { field.style.borderColor = ''; })
);
