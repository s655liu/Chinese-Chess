import UI from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    window.app = new UI();

    // Tab Switching Logic
    const navLinks = document.querySelectorAll('.nav-link');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            const targetTab = link.getAttribute('data-tab');

            // Update nav links
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Update tab panes
            tabPanes.forEach(pane => {
                pane.classList.remove('active');
                if (pane.id === `tab-${targetTab}`) {
                    pane.classList.add('active');
                }
            });
        });
    });
});
