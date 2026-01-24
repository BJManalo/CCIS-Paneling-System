
// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Chart instances
let chartTitle = null;
let chartPreOral = null;
let chartFinal = null;

// Data storage
let allGroups = [];
let instructorName = '';

document.addEventListener('DOMContentLoaded', () => {
    // Check Login
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser || loginUser.role !== 'Instructor') {
        window.location.href = '../../index.html';
        return;
    }
    instructorName = loginUser.full_name || ''; // Assuming 'full_name' is the property

    fetchDashboardData();
});

async function fetchDashboardData() {
    try {
        // Fetch all student groups
        // We fetch ALL then filter by Adviser in JS to keep logic simple
        // Alternatively, we could filter in query .eq('adviser', instructorName)
        const { data, error } = await supabaseClient
            .from('student_groups')
            .select('*');

        if (error) throw error;

        allGroups = data || [];

        // Populate Section Filter (based on MY groups)
        populateSectionFilter();

        // Initial Draw
        applyDashboardFilters();

    } catch (err) {
        console.error('Error fetching dashboard data:', err);
    }
}

function populateSectionFilter() {
    const sectionFilter = document.getElementById('sectionFilter');

    // Filter groups where I am the adviser first
    const myGroups = allGroups.filter(g =>
        g.adviser && g.adviser.toLowerCase().trim() === instructorName.toLowerCase().trim()
    );

    // Get unique sections
    const sections = [...new Set(myGroups.map(g => g.section).filter(Boolean))].sort();

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
        // 1. Must be MY group (Adviser check)
        const isMyGroup = g.adviser && g.adviser.toLowerCase().trim() === instructorName.toLowerCase().trim();
        if (!isMyGroup) return false;

        // 2. Program Filter
        const progMatch = program === 'ALL' || (g.program && g.program.toUpperCase() === program);

        // 3. Section Filter
        const sectMatch = section === 'ALL' || (g.section && g.section === section);

        return progMatch && sectMatch;
    });

    updateCharts(filtered);
};

function updateCharts(groups) {
    const total = groups.length;

    // Reuse similar logic to Admin
    const countPassed = (groups, statusCol, passValue = ['Approved', 'Passed']) => {
        return groups.filter(g => {
            let val = g[statusCol];
            if (!val) return false;
            let status = val;
            try {
                if (val.startsWith('{')) {
                    const parsed = JSON.parse(val);
                    status = Object.values(parsed).join(' ');
                }
            } catch (e) { /* ignore */ }
            return passValue.some(p => status.toLowerCase().includes(p.toLowerCase()));
        }).length;
    };

    const titleCount = countPassed(groups, 'title_status', ['Approved']);
    const preOralCount = countPassed(groups, 'pre_oral_status', ['Passed', 'Approved']);
    const finalCount = countPassed(groups, 'final_status', ['Passed', 'Approved']);

    // Draw Charts
    drawChart('chartTitle', titleCount, total, '#3b82f6');
    drawChart('chartPreOral', preOralCount, total, '#d97706');
    drawChart('chartFinal', finalCount, total, '#16a34a');
}

function drawChart(canvasId, value, total, color) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    if (total === 0) total = 1;
    const percentage = Math.round((value / total) * 100);
    const remaining = 100 - percentage;

    // Destroy previous instance
    if (canvasId === 'chartTitle' && chartTitle) chartTitle.destroy();
    if (canvasId === 'chartPreOral' && chartPreOral) chartPreOral.destroy();
    if (canvasId === 'chartFinal' && chartFinal) chartFinal.destroy();

    const config = {
        type: 'doughnut',
        data: {
            labels: ['Completed', 'Pending'],
            datasets: [{
                data: [percentage, remaining],
                backgroundColor: [color, '#f1f5f9'],
                borderWidth: 0
            }]
        },
        options: {
            cutout: '70%',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        },
        plugins: [{
            id: 'textCenter',
            beforeDraw: function (chart) {
                var width = chart.width,
                    height = chart.height,
                    ctx = chart.ctx;

                ctx.restore();
                var fontSize = (height / 114).toFixed(2);
                ctx.font = "bold " + fontSize + "em sans-serif";
                ctx.textBaseline = "middle";
                ctx.fillStyle = color;

                var text = percentage + "%",
                    textX = Math.round((width - ctx.measureText(text).width) / 2),
                    textY = height / 2;

                ctx.fillText(text, textX, textY);
                ctx.save();
            }
        }]
    };

    const newChart = new Chart(ctx, config);

    if (canvasId === 'chartTitle') chartTitle = newChart;
    if (canvasId === 'chartPreOral') chartPreOral = newChart;
    if (canvasId === 'chartFinal') chartFinal = newChart;
}

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}

// Keep filter function dummy
window.filterTable = (program) => {
    // Keep as dummy or link to upper logic if desired
    // Instructor dashboard might have had a table below.
    // If the user wants to keep the table functional:
    document.getElementById('programFilter').value = program;
    applyDashboardFilters();
};
