/* ==========================
   Safe Script Skeleton
   For Theme & Loader
   ========================== */

// Fullscreen Gold Loader
document.addEventListener('DOMContentLoaded', function () {
    const loader = document.createElement('div');
    loader.id = 'goldLoader';
    loader.style.position = 'fixed';
    loader.style.top = 0;
    loader.style.left = 0;
    loader.style.width = '100%';
    loader.style.height = '100%';
    loader.style.background = 'rgba(255, 255, 255, 0.95)';
    loader.style.display = 'flex';
    loader.style.alignItems = 'center';
    loader.style.justifyContent = 'center';
    loader.style.zIndex = 9999;
    loader.style.transition = 'opacity 0.5s ease';
    loader.innerHTML = `<div style="border: 4px solid #d4af37; border-top: 4px solid transparent; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite;"></div>`;

    document.body.appendChild(loader);

    // Wait for page fully loaded
    window.addEventListener('load', () => {
        loader.style.opacity = 0;
        setTimeout(() => loader.remove(), 500);
    });
});

// Loader spin animation
const style = document.createElement('style');
style.innerHTML = `
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
`;
document.head.appendChild(style);

/* ==========================
   Safe Menu & Nav
   ========================== */
document.addEventListener('DOMContentLoaded', function () {
    const navLinks = document.querySelectorAll('.nav-links li a');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // Placeholder for future navigation logic
            console.log('Navigating to:', link.href);
        });
    });
});

/* ==========================
   Placeholder Functions
   ========================== */
// Prevent JS crashes from missing functions
function userShareSMS() {
    console.warn('userShareSMS() is not yet implemented.');
}
function otherReferralFunctions() {
    console.warn('Referral functions are not yet restored.');
}
