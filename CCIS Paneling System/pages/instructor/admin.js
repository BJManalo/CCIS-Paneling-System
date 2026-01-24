document.addEventListener('DOMContentLoaded', () => {

    // --- Filters ---
    const filterBtns = document.querySelectorAll('.filter-btn');

    window.filterTable = (program) => {
        // Reset active states
        filterBtns.forEach(btn => btn.classList.remove('active'));

        // Set active state for clicked button (except 'clear')
        const activeBtn = document.querySelector(`.filter-btn.${program.toLowerCase()}`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        console.log(`Filtering by: ${program}`);
        // In a real app, this would filter the rows.
    };

    // --- Search ---
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        console.log(`Searching for: ${query}`);
    });

    // --- Bottom Nav ---
    // Navigation is handled by standard HTML links.

    // --- Empty State Check ---
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');

    if (tableBody.children.length === 0 || (tableBody.children.length === 1 && tableBody.children[0].nodeType === Node.COMMENT_NODE)) {
        emptyState.style.display = 'flex';
        // If empty, hide pagination for cleaner look
        document.querySelector('.pagination').style.display = 'none';

        // Hide table header if no data? Maybe keep it to show structure.
        // document.querySelector('thead').style.display = 'none';
    } else {
        emptyState.style.display = 'none';
    }

});

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}

