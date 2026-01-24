
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
    // 1. Approved Titles (Title Defense 'Approved')
    const approvedTitles = countStatus(groups, 'title_status', ['Approved']);

    // 2. Recommended Titles (Pre-Oral 'Passed' or 'Approved')
    // Note: User asked for "Recommended Titles" tab for Pre-Oral
    const recommendedTitles = countStatus(groups, 'pre_oral_status', ['Passed', 'Approved']);

    // 3. Completed (Graduates)
    // "once the panel decision in the chapter 5 ... is approve that title is automatic completed"
    const completed = countStatus(groups, 'final_status', ['Passed', 'Approved']);

    // Animate or set text
    document.getElementById('countTitle').innerText = approvedTitles;
    document.getElementById('countPreOral').innerText = recommendedTitles;
    document.getElementById('countFinal').innerText = completed;
}

function countStatus(groups, statusCol, passValues) {
    return groups.filter(g => {
        let val = g[statusCol];
        if (!val) return false;

        // Handle JSON or String
        let status = val;
        try {
            if (val.startsWith('{')) {
                const parsed = JSON.parse(val);
                status = Object.values(parsed).join(' ');
            }
        } catch (e) { /* ignore */ }

        return passValues.some(p => status.toLowerCase().includes(p.toLowerCase()));
    }).length;
}

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}

// Keep filterTable dummy function
window.filterTable = (program) => {
    document.getElementById('programFilter').value = program;
    applyDashboardFilters();
};
