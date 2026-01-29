document.addEventListener('DOMContentLoaded', () => {

    // --- Filters ---
    const filterBtns = document.querySelectorAll('.filter-btn');

    window.filterTable = (program) => {
        // Reset active states
        filterBtns.forEach(btn => btn.classList.remove('active'));

        // Set active state for clicked button
        const activeBtn = document.querySelector(`.filter-btn.${program.toLowerCase()}`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        console.log(`Filtering Capstone by: ${program}`);
    };

    // --- Empty State Check ---
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');

    if (tableBody.children.length === 0 || (tableBody.children.length === 1 && tableBody.children[0].nodeType === Node.COMMENT_NODE)) {
        emptyState.style.display = 'flex';
        document.querySelector('.pagination').style.display = 'none';
    } else {
        emptyState.style.display = 'none';
    }

    // --- Search Icon Click (Optional Mockup Feature) ---
    // The mockup shows a search icon on the right, typically clickable or just an indicator.

    // Animate charts on load
    const charts = document.querySelectorAll('.pie-chart');
    charts.forEach(chart => {
        const percentage = chart.style.getPropertyValue('--percentage');
        chart.style.setProperty('--percentage', '0');

        setTimeout(() => {
            // Simple visual transition effect using CSS transition if supported, 
            // but for conic-gradient we might need JS interval or just set it and let it be static.
            // CSS transition for custom properties isn't fully supported everywhere without registerProperty.
            // We'll just set it back for now.
            chart.style.setProperty('--percentage', percentage);
        }, 100);
    });
    renderTable(sampleData);
});

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
}

