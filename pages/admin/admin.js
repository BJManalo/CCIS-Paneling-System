
// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Data storage
let allGroups = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchDashboardData();
});

async function fetchDashboardData() {
    try {
        // Fetch all student groups
        const { data, error } = await supabaseClient
            .from('student_groups')
            .select('*');

        if (error) throw error;

        allGroups = data || [];

        // Populate Section Filter
        populateSectionFilter();

        // Initial Count Update
        applyDashboardFilters();

    } catch (err) {
        console.error('Error fetching dashboard data:', err);
    }
}

function populateSectionFilter() {
    const sectionFilter = document.getElementById('sectionFilter');
    const sections = [...new Set(allGroups.map(g => g.section).filter(Boolean))].sort();

    sections.forEach(sec => {
        const option = document.createElement('option');
        option.value = sec;
        option.textContent = sec;
        sectionFilter.appendChild(option);
    });
}

window.applyDashboardFilters = () => {
    const program = document.getElementById('programFilter').value;
    const section = document.getElementById('sectionFilter').value;

    // Filter data
    const filtered = allGroups.filter(g => {
        const progMatch = program === 'ALL' || (g.program && g.program.toUpperCase() === program);
        const sectMatch = section === 'ALL' || (g.section && g.section === section);
        return progMatch && sectMatch;
    });

    updateCounts(filtered);
};

function updateCounts(groups) {
    // 1. Approved Titles
    const approvedTitles = countStatus(groups, 'title_status', ['Approved']);

    // 2. Rejected Titles (changed from Recommended as per latest request)
    const rejectedTitles = countStatus(groups, 'title_status', ['Rejected']);

    // 3. Completed (Graduates)
    const completed = countStatus(groups, 'final_status', ['Passed', 'Approved']);

    // Animate or set text
    const titleEl = document.getElementById('countTitle');
    const preOralEl = document.getElementById('countPreOral');
    const finalEl = document.getElementById('countFinal');

    // Update Labels if needed (HTML might say "Recommended", we should ensure it matches "Rejected")
    // Previous HTML had "Recommended Titles". User asked for "Rejected Titles".
    // I should update the HTML too, or simpler: update the ID or just the number logic.
    // I'll update text content headers in JS if possible or assume HTML update.
    // Let's stick to updating numbers. 
    // Wait, the HTML says "Recommended Titles" for the middle card.
    // I will rename the middle card title dynamically to "Rejected Titles" to be safe.

    // Safety check for elements
    if (titleEl) titleEl.innerText = approvedTitles;
    if (preOralEl) {
        preOralEl.innerText = rejectedTitles;
        // Find sibling key
        const titleContainer = preOralEl.parentElement.querySelector('.chart-title');
        if (titleContainer) titleContainer.innerText = "Rejected Titles";
        preOralEl.style.color = '#dc2626'; // Red for rejected
    }
    if (finalEl) finalEl.innerText = completed;
}

function countStatus(groups, statusCol, passValues) {
    let count = 0;
    groups.forEach(g => {
        let val = g[statusCol];
        if (!val) return;

        try {
            if (val.startsWith('{')) {
                const parsed = JSON.parse(val);
                const values = Object.values(parsed);
                values.forEach(v => {
                    if (passValues.some(p => v.toLowerCase().includes(p.toLowerCase()))) {
                        count++;
                    }
                });
            } else {
                if (passValues.some(p => val.toLowerCase().includes(p.toLowerCase()))) {
                    count++;
                }
            }
        } catch (e) {
            if (passValues.some(p => val.toLowerCase().includes(p.toLowerCase()))) {
                count++;
            }
        }
    });
    return count;
}

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}

window.filterTable = (program) => {
    document.getElementById('programFilter').value = program;
    applyDashboardFilters();
};
