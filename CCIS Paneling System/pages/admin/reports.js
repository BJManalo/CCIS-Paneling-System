document.addEventListener('DOMContentLoaded', () => {

    // --- Program Filters ---
    const filterBtns = document.querySelectorAll('.filter-btn');

    window.filterTable = (program) => {
        // Reset active states
        filterBtns.forEach(btn => btn.classList.remove('active'));

        // Set active state for clicked button
        const activeBtn = document.querySelector(`.filter-btn.${program.toLowerCase()}`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        console.log(`Filtering Reports by Program: ${program}`);
    };

    // --- Status Checkboxes ---
    const checkboxes = document.querySelectorAll('input[name="status"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const checkedStatuses = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);

            console.log(`Filtering Reports by Status: ${checkedStatuses.join(', ')}`);
        });
    });

    // --- Empty State Check ---
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');

    if (tableBody.children.length === 0 || (tableBody.children.length === 1 && tableBody.children[0].nodeType === Node.COMMENT_NODE)) {
        emptyState.style.display = 'flex';
        document.querySelector('.pagination').style.display = 'none';
    } else {
        emptyState.style.display = 'none';
    }
});

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}

