// Initialize Supabase client handled in html

document.addEventListener('DOMContentLoaded', () => {
    loadGrades();
});

async function loadGrades() {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));

    if (!loginUser) {
        window.location.href = '../../';
        return;
    }

    let groupId = loginUser.id;

    try {
        // Fetch group members and their grades
        const { data: group, error } = await supabaseClient
            .from('student_groups')
            .select(`
                *,
                students (
                    id,
                    full_name,
                    grades (
                        grade_type,
                        grade
                    )
                )
            `)
            .eq('id', groupId)
            .single();

        if (error) {
            console.error('Error fetching grades:', error);
            showToast('Error fetching grades: ' + error.message, 'error');
            document.getElementById('loading-spinner').innerHTML = `<p style="text-align:center; color:#ef4444;">Error: ${error.message}</p>`;
            return;
        }

        document.getElementById('loading-spinner').style.display = 'none';
        document.getElementById('grades-ui').style.display = 'block';

        if (group && group.students && group.students.length > 0) {
            processAndRenderGrades(group.students);
        } else {
            document.getElementById('grades-content').innerHTML = '<div class="empty-state">No student records found.</div>';
        }

    } catch (err) {
        console.error('Unexpected error:', err);
        showToast('Unexpected error: ' + err.message, 'error');
        // document.getElementById('loading-spinner').innerHTML = `<p style="text-align:center; color:#ef4444;">Unexpected Error: ${err.message}</p>`;
        // Check if loading-spinner exists, if not it might be hidden, maybe grades-ui is not shown yet
        const spinner = document.getElementById('loading-spinner');
        if (spinner) spinner.innerHTML = `<p style="text-align:center; color:#ef4444;">Unexpected Error: ${err.message}</p>`;
    }
}

function processAndRenderGrades(students) {
    // 1. Collect all unique grade types present across all students
    const preferredOrder = ['Title Defense', 'Pre Oral Defense', 'Final Defense'];
    const foundTypes = new Set();

    // Structure: { 'Title Defense': [ { studentName: '...', grade: '...' }, ... ], ... }
    const gradesByType = {};

    students.forEach(student => {
        if (!student.grades) return;

        student.grades.forEach(g => {
            const type = g.grade_type || 'Other';
            foundTypes.add(type);

            if (!gradesByType[type]) {
                gradesByType[type] = [];
            }

            gradesByType[type].push({
                studentName: student.full_name,
                grade: g.grade
            });
        });
    });

    // Sort types based on preferred order
    const sortedTypes = Array.from(foundTypes).sort((a, b) => {
        const indexA = preferredOrder.indexOf(a);
        const indexB = preferredOrder.indexOf(b);

        // If both are in the preferred list, sort by index
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        // If only A is in list, A comes first
        if (indexA !== -1) return -1;
        // If only B is in list, B comes first
        if (indexB !== -1) return 1;
        // Otherwise sort alphabetically
        return a.localeCompare(b);
    });

    if (sortedTypes.length === 0) {
        document.getElementById('grades-content').innerHTML = '<div class="empty-state">No grades have been released yet.</div>';
        return;
    }

    // Render Tabs
    const tabsContainer = document.getElementById('grades-tabs');
    tabsContainer.innerHTML = '';

    sortedTypes.forEach((type, index) => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${index === 0 ? 'active' : ''}`;
        btn.innerText = type;
        btn.onclick = () => switchTab(type, btn, gradesByType);
        tabsContainer.appendChild(btn);
    });

    // Render Initial Content (First Tab)
    renderTabContent(sortedTypes[0], gradesByType);
}

function switchTab(type, btn, gradesByType) {
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Render content
    renderTabContent(type, gradesByType);
}

function renderTabContent(type, gradesByType) {
    const contentContainer = document.getElementById('grades-content');
    const records = gradesByType[type] || [];

    if (records.length === 0) {
        contentContainer.innerHTML = '<div class="empty-state">No grades available for this stage.</div>';
        return;
    }

    const tableRows = records.map(record => `
        <tr>
            <td style="font-weight: 500;">${record.studentName || 'Unknown Student'}</td>
            <td style="font-weight: 700; color: var(--primary-dark);">${record.grade !== null ? record.grade : '-'}</td>
        </tr>
    `).join('');

    contentContainer.innerHTML = `
        <table class="grades-table">
            <thead>
                <tr>
                    <th style="padding:15px; border-bottom:1px solid #e2e8f0; text-align:left;">Student Name</th>
                    <th style="padding:15px; border-bottom:1px solid #e2e8f0; text-align:left;">Grade</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;
}

const showToast = (message, type = 'info') => {
    let toast = document.getElementById('toast');
    if (!toast) return;

    const msg = document.getElementById('toastMessage');
    const icon = document.getElementById('toastIcon');

    msg.innerText = message;

    if (type === 'success') {
        toast.style.backgroundColor = '#10b981';
        icon.innerText = 'check_circle';
    } else if (type === 'error') {
        toast.style.backgroundColor = '#ef4444';
        icon.innerText = 'error';
    } else {
        toast.style.backgroundColor = '#333';
        icon.innerText = 'info';
    }

    toast.style.visibility = 'visible';
    setTimeout(() => {
        toast.style.visibility = 'hidden';
    }, 3000);
};

