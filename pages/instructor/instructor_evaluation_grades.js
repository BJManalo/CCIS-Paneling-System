// instructor_evaluation_grades.js

// --- Configuration ---
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// --- GLOBAL STATE ---
let currentMainTab = 'evaluation'; // Default

// Evaluation State
let evaluationData = [];
let rawGroups = [];
let allDefenseStatuses = [];
let currentEvalTypeFilter = 'ALL';
let currentEvalSubTab = 'Advisory';

// Grades State
let allGradesData = [];
let fetchedGradeGroups = [];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Initial loads
    loadEvaluations();
    loadGrades();

    // Global Search
    document.getElementById('combinedSearchInput').addEventListener('input', () => {
        if (currentMainTab === 'evaluation') {
            applyEvalFilters();
        } else {
            renderGrades();
        }
    });

    // Grades specific listeners
    document.getElementById('typeFilter').addEventListener('change', renderGrades);
    document.getElementById('sectionFilter').addEventListener('change', renderGrades);
    document.getElementById('programFilter').addEventListener('change', renderGrades);

    initTooltip();
});

// --- MAIN TAB SWITCHING ---
window.switchTab = (tab) => {
    currentMainTab = tab;

    // UI Updates
    document.getElementById('main-tab-evaluation').classList.toggle('active', tab === 'evaluation');
    document.getElementById('main-tab-grades').classList.toggle('active', tab === 'grades');

    document.getElementById('evaluationSection').classList.toggle('active', tab === 'evaluation');
    document.getElementById('gradesSection').classList.toggle('active', tab === 'grades');

    // Update Search Placeholder
    const searchInput = document.getElementById('combinedSearchInput');
    if (tab === 'evaluation') {
        searchInput.placeholder = "Search Evaluations...";
    } else {
        searchInput.placeholder = "Search Group or Student Grades...";
    }
};

// ==========================================
// EVALUATION LOGIC (from instructor_evaluation.js)
// ==========================================

const individualCriteria = [
    { name: 'Clarity & Organization', rubrics: { 4: 'Well-structured, clear transitions between topics, logical flow.', 3: 'Mostly clear, with minor disorganization or unclear transitions.', 2: 'Somewhat disorganized or unclear in parts, making it hard to follow.', 1: 'Poorly organized, hard to follow or understand.' } },
    { name: 'Engagement', rubrics: { 4: 'The presentation is very engaging. Group members keep the audience interested throughout.', 3: 'The presentation is engaging for the most part, with minor lapses.', 2: 'The presentation has a few engaging moments but lacks consistency.', 1: 'The presentation is monotonous or disengaging.' } },
    { name: 'Delivery', rubrics: { 4: 'Confident, natural delivery. Eye contact maintained, good pace, well-practiced.', 3: 'Good delivery, but a bit hesitant or awkward at times.', 2: 'Delivery is stiff or disjointed, with awkward pauses or excessive reading.', 1: 'Unclear, rushed, or overly nervous delivery.' } },
    { name: 'Content Knowledge', rubrics: { 4: 'Highly effective visuals that enhance understanding and support key points.', 3: 'Visuals are clear and relevant, with some room for improvement.', 2: 'Visuals are adequate but don\'t strongly support the presentation.', 1: 'Visuals are unclear or distracting, with little relation to content.' } },
    { name: 'Team Collaboration', rubrics: { 4: 'Excellent team coordination, each member contributes clearly and equally.', 3: 'Most members contribute equally, with some minor imbalances.', 2: 'Some members dominate the presentation, while others contribute minimally.', 1: 'Team lacks cohesion, with unequal contributions or visible disconnects.' } },
    { name: 'Professionalism', rubrics: { 4: 'Well-prepared, professional demeanor, answers questions confidently and competently.', 3: 'Generally professional, but with minor lapses in preparation or handling questions.', 2: 'Somewhat unprofessional or unprepared, struggles with questions.', 1: 'Unprepared, unprofessional behavior or failure to answer questions.' } },
    { name: 'Time Management', rubrics: { 4: 'Presentation adheres strictly to time limits, covering all necessary points concisely.', 3: 'Minor overrun or rush at the end, but overall time was well-managed.', 2: 'Presentation exceeds or fails to meet time expectations, lacking detail in some areas.', 1: 'Presentation is too long or short, missing essential content.' } }
];

const systemCriteria = [
    { name: 'System Functionality', rubrics: { 4: 'System is fully functional with all key features working as intended (at least 70% complete).', 3: 'System is mostly functional with minor issues or missing features.', 2: 'System has several non-functional or incomplete features.', 1: 'System has major functionality issues or is incomplete.' } },
    { name: 'Technical Complexity', rubrics: { 4: 'The system demonstrates a high level of technical skill and complexity (advanced features, integration, etc.).', 3: 'System demonstrates solid technical skills but lacks advanced features.', 2: 'Basic system with limited technical complexity or advanced concepts.', 1: 'System lacks technical depth or fails to implement basic concepts.' } },
    { name: 'Usability', rubrics: { 4: 'System is intuitive and user-friendly, easy to navigate and use.', 3: 'System is mostly user-friendly, with minor usability issues.', 2: 'System has some usability issues that make it difficult to use.', 1: 'System is difficult to use or lacks clear user interface design.' } },
    { name: 'Code Quality & Organization', rubrics: { 4: 'Code is well-structured, well-documented, and follows best practices.', 3: 'Code is generally well-written but lacks documentation or could be better organized.', 2: 'Code is functional but has readability or organizational issues.', 1: 'Code is poorly written, hard to understand, or lacks necessary documentation.' } },
    { name: 'Innovation & Creativity', rubrics: { 4: 'The system showcases innovative ideas or creative solutions to problems.', 3: 'Some original ideas or creative approaches are evident.', 2: 'Little innovation, relying mostly on standard solutions.', 1: 'No creativity or innovation, very basic or copied ideas.' } },
    { name: 'Testing & Debugging', rubrics: { 4: 'System is thoroughly tested with no major bugs or errors.', 3: 'System has been tested with few minor issues remaining.', 2: 'Some testing was done, but there are bugs or issues that hinder functionality.', 1: 'Little to no testing, system is full of bugs or crashes.' } },
    { name: 'Documentation & Reporting', rubrics: { 4: 'Clear, comprehensive documentation that includes detailed explanations of system design, code, and usage.', 3: 'Good documentation, but may lack detail in some areas.', 2: 'Documentation is minimal or unclear, with gaps in explanations.', 1: 'No documentation, or it is incomplete and unhelpful.' } },
    { name: 'System Presentation/Demo', rubrics: { 4: 'The system is demonstrated effectively, with a clear explanation of how it works and what each feature does.', 3: 'The system is demonstrated well but may have minor gaps in explanation.', 2: 'System is demonstrated, but the explanation is unclear or incomplete.', 1: 'System is not demonstrated, or demo fails to work properly.' } }
];

async function loadEvaluations() {
    const accordionContainer = document.getElementById('accordionContainer');
    try {
        const { data: groups, error } = await supabaseClient
            .from('student_groups')
            .select(`*, students ( id, full_name ), schedules ( id, schedule_type, panel1, panel2, panel3, panel4, panel5 )`)
            .order('created_at', { ascending: false });

        if (error) throw error;
        rawGroups = groups || [];

        const { data: statuses } = await supabaseClient.from('defense_statuses').select('*');
        allDefenseStatuses = statuses || [];

        const { data: indScores } = await supabaseClient.from('individual_evaluations').select('*');
        const { data: sysScores } = await supabaseClient.from('system_evaluations').select('*');

        let processed = [];
        (groups || []).forEach(group => {
            (group.schedules || []).forEach(sched => {
                const relevantInd = (indScores || []).filter(s => s.schedule_id === sched.id);
                const raters = [...new Set(relevantInd.map(s => s.panelist_name))];
                const relevantSys = (sysScores || []).filter(s => s.schedule_id === sched.id);
                const sysRaters = relevantSys.map(s => s.panelist_name);
                const allRaters = [...new Set([...raters, ...sysRaters])];

                let dType = (sched.schedule_type || 'Defense').replace(/ defense$/i, '').trim();

                allRaters.forEach(panelist => {
                    processed.push({
                        id: sched.id + '-' + panelist.replace(/\s+/g, ''),
                        schedId: sched.id, groupId: group.id, groupName: group.group_name, program: group.program,
                        members: group.students || [], title: group.title, defenseType: dType, panelistName: panelist,
                        adviser: group.adviser, createdBy: group.created_by || group.user_id,
                        savedScores: {
                            individual: (indScores || []).filter(s => s.schedule_id === sched.id && s.panelist_name.toLowerCase() === panelist.toLowerCase()),
                            system: (sysScores || []).find(s => s.schedule_id === sched.id && s.panelist_name.toLowerCase() === panelist.toLowerCase())
                        }
                    });
                });
            });
        });

        evaluationData = processed;
        switchEvaluationSubTab(currentEvalSubTab);

    } catch (err) {
        console.error('Error loading evaluations:', err);
        if (accordionContainer) accordionContainer.innerHTML = '<p style="text-align: center; color: red;">Error loading data.</p>';
    }
}

window.switchEvaluationSubTab = (tab) => {
    currentEvalSubTab = tab;
    document.getElementById('tab-advisory').classList.toggle('active', tab === 'Advisory');
    document.getElementById('tab-evaluation').classList.toggle('active', tab === 'Evaluation');

    const accordion = document.getElementById('accordionContainer');
    const advisoryTable = document.getElementById('advisoryTableContainer');
    const allBtn = document.getElementById('eval-filter-all');

    if (tab === 'Advisory') {
        if (accordion) accordion.style.display = 'none';
        if (advisoryTable) advisoryTable.style.display = 'block';
        if (allBtn) allBtn.textContent = 'All Advisory';
        renderAdvisoryTable();
    } else {
        if (accordion) accordion.style.display = 'block';
        if (advisoryTable) advisoryTable.style.display = 'none';
        if (allBtn) allBtn.textContent = 'All Evaluations';
        applyEvalFilters();
    }
};

function renderAdvisoryTable() {
    const tbody = document.getElementById('advisoryTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const user = JSON.parse(localStorage.getItem('loginUser') || '{}');
    const userName = (user.full_name || '').toLowerCase();

    const myGroups = rawGroups.filter(g => {
        const adv = (g.adviser || '').toLowerCase();
        return adv.includes(userName) || (userName && userName.includes(adv));
    });

    if (myGroups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No groups assigned to you as Adviser.</td></tr>';
        return;
    }

    myGroups.forEach(group => {
        const schedules = group.schedules || [];
        let targetSched = null;
        let displayType = '';

        if (currentEvalTypeFilter !== 'ALL') {
            if (currentEvalTypeFilter === 'title') targetSched = schedules.find(s => s.schedule_type?.includes('Title'));
            if (currentEvalTypeFilter === 'pre') targetSched = schedules.find(s => s.schedule_type?.includes('Pre'));
            if (currentEvalTypeFilter === 'final') targetSched = schedules.find(s => s.schedule_type?.includes('Final'));
            if (!targetSched) return;
            displayType = targetSched.schedule_type;
        } else {
            const final = schedules.find(s => s.schedule_type?.includes('Final'));
            const pre = schedules.find(s => s.schedule_type?.includes('Pre'));
            const title = schedules.find(s => s.schedule_type?.includes('Title'));
            if (final) { targetSched = final; displayType = 'Final Defense'; }
            else if (pre) { targetSched = pre; displayType = 'Pre-Oral Defense'; }
            else { targetSched = title; displayType = 'Title Defense'; }
        }

        let displayStatus = 'Not Scheduled';
        if (targetSched) displayStatus = 'Scheduled';

        let titleStr = group.title;
        if (typeof titleStr === 'object' && titleStr !== null) titleStr = titleStr.title1 || Object.values(titleStr)[0] || '';
        else if (typeof titleStr === 'string' && titleStr.startsWith('{')) { try { const t = JSON.parse(titleStr); titleStr = t.title1 || Object.values(t)[0]; } catch (e) { } }
        if (titleStr && titleStr.length > 50) titleStr = titleStr.substring(0, 50) + '...';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span style="font-weight:600; color:var(--primary-color);">${titleStr || 'Untitled'}</span></td>
            <td>${group.group_name}</td>
            <td><div class="chips-container">${(group.students || []).map(m => `<span class="chip">${m.full_name}</span>`).join('')}</div></td>
            <td><span class="type-badge ${getTypeClass(displayType || 'Defense')}">${displayType || 'N/A'}</span></td>
            <td><span class="status-badge ${displayStatus === 'Not Scheduled' ? 'rejected' : 'pending'}">${displayStatus}</span></td>
        `;
        tbody.appendChild(row);
    });
}

window.setEvalFilter = (type, btn) => {
    currentEvalTypeFilter = type;
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (currentEvalSubTab === 'Advisory') renderAdvisoryTable();
    else applyEvalFilters();
};

function applyEvalFilters() {
    const searchTerm = document.getElementById('combinedSearchInput').value.toLowerCase();
    const user = JSON.parse(localStorage.getItem('loginUser') || '{}');
    const userName = (user.full_name || '').toLowerCase();
    const userId = user.id;

    const filtered = evaluationData.filter(ev => {
        let matchesMain = true;
        const adviser = (ev.adviser || '').toLowerCase();
        const isAdviser = adviser.includes(userName) || (userName && userName.includes(adviser));

        if (currentEvalSubTab === 'Advisory') matchesMain = isAdviser;
        else matchesMain = ev.createdBy == userId || !ev.createdBy;

        if (!matchesMain) return false;

        const matchesText = ev.groupName.toLowerCase().includes(searchTerm) || ev.panelistName.toLowerCase().includes(searchTerm) || ev.defenseType.toLowerCase().includes(searchTerm);
        let matchesType = true;
        const dType = ev.defenseType.toLowerCase();
        if (currentEvalTypeFilter === 'title') matchesType = dType.includes('title');
        else if (currentEvalTypeFilter === 'pre') matchesType = dType.includes('pre');
        else if (currentEvalTypeFilter === 'final') matchesType = dType.includes('final');

        return matchesText && matchesType;
    });

    renderEvalAccordions(filtered);
}

function renderEvalAccordions(list) {
    const container = document.getElementById('accordionContainer');
    container.innerHTML = '';
    list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'evaluation-card';
        const program = (item.program || '').toUpperCase();
        const progClass = program.includes('BSIS') ? 'prog-bsis' : program.includes('BSIT') ? 'prog-bsit' : program.includes('BSCS') ? 'prog-bscs' : 'prog-unknown';
        const typeClass = getTypeClass(item.defenseType);

        card.innerHTML = `
             <div class="card-header" onclick="toggleAccordion('${item.id}')">
                 <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="group-name">${item.groupName}</span>
                            <span class="prog-badge ${progClass}">${program}</span>
                        </div>
                        <div style="font-size: 0.9rem; color: #64748b; margin-top: 4px;">Rated by: <strong style="color: var(--primary-color);">${item.panelistName}</strong></div>
                        <div style="margin-top: 8px;"><span class="type-badge ${typeClass}">${item.defenseType}</span></div>
                    </div>
                    <span class="material-icons-round expand-icon" id="icon-${item.id}" style="color: #9ca3af; transition: transform 0.3s; font-size: 24px;">expand_more</span>
                 </div>
             </div>
             <div class="card-body" id="body-${item.id}" style="display: none;">
                 <div class="card-content">${getEvalCardContent(item)}</div>
             </div>
        `;
        container.appendChild(card);
    });
}

function getEvalCardContent(item) {
    const type = (item.defenseType || '').toLowerCase();
    const isMulti = type.includes('pre') || type.includes('final');
    let html = '';
    if (isMulti) {
        html += `<div class="switcher-tabs"><button class="switcher-btn active" id="btn-p1-${item.id}" onclick="switchEvalPage('${item.id}', 1)"><span class="material-icons-round">person</span> Individual</button>
                 <button class="switcher-btn" id="btn-p2-${item.id}" onclick="switchEvalPage('${item.id}', 2)"><span class="material-icons-round">dvr</span> System Project</button></div>`;
    }
    html += `<div class="eval-step active" id="step1-${item.id}">${renderIndividualTable(item)}</div>`;
    if (isMulti) {
        html += `<div class="eval-step" id="step2-${item.id}">${renderSystemTable(item)}</div>`;
    }
    return html;
}

function renderIndividualTable(item) {
    let headers = item.members.map((s, i) => `<th>${s.full_name}<br><span style="font-size: 10px; color: #9ca3af;">Presenter ${i + 1}</span></th>`).join('');
    const cols = ['clarity_score', 'engagement_score', 'delivery_score', 'knowledge_score', 'collab_score', 'prof_score', 'time_score'];
    let rows = individualCriteria.map((c, ci) => {
        let inputs = item.members.map(s => {
            const score = item.savedScores.individual.find(sc => sc.student_id === s.id);
            return `<td>${(score ? score[cols[ci]] : '-') || '-'}</td>`;
        }).join('');
        return `<tr><td style="text-align:left; background:#fafafa;"><strong>${c.name}</strong></td>${inputs}</tr>`;
    }).join('');
    let totals = item.members.map(s => `<td>${(item.savedScores.individual.find(sc => sc.student_id === s.id)?.total_score) || 0}</td>`).join('');

    return `<div class="table-responsive"><table class="eval-table"><thead><tr><th>Criteria</th>${headers}</tr></thead><tbody>${rows}<tr style="background:#f8fbff;"><td><strong>TOTAL</strong></td>${totals}</tr></tbody></table></div>`;
}

function renderSystemTable(item) {
    const sysCols = ['func_score', 'tech_score', 'usability_score', 'code_score', 'innov_score', 'testing_score', 'docu_score', 'demo_score'];
    let rows = systemCriteria.map((c, ci) => `<tr><td style="text-align:left; background:#fafafa;"><strong>${c.name}</strong></td><td>${(item.savedScores.system ? item.savedScores.system[sysCols[ci]] : '-') || '-'}</td></tr>`).join('');
    return `<div class="table-responsive" style="max-width:600px; margin:0 auto;"><table class="eval-table"><thead><tr><th>Technical Criteria</th><th>Score</th></tr></thead><tbody>${rows}<tr style="background:#f1f5f9;"><td><strong>TOTAL SYSTEM SCORE</strong></td><td><strong>${item.savedScores.system?.total_score || 0}</strong></td></tr></tbody></table></div>`;
}

window.toggleAccordion = (id) => {
    const b = document.getElementById(`body-${id}`);
    const ic = document.getElementById(`icon-${id}`);
    const isHidden = b.style.display === 'none';
    b.style.display = isHidden ? 'block' : 'none';
    ic.textContent = isHidden ? 'expand_less' : 'expand_more';
    ic.style.color = isHidden ? 'var(--primary-color)' : '#888';
};

window.switchEvalPage = (id, p) => {
    document.getElementById(`step1-${id}`).classList.toggle('active', p === 1);
    document.getElementById(`step2-${id}`).classList.toggle('active', p === 2);
    document.getElementById(`btn-p1-${id}`).classList.toggle('active', p === 1);
    document.getElementById(`btn-p2-${id}`).classList.toggle('active', p === 2);
};

function getTypeClass(t) {
    const l = (t || '').toLowerCase();
    if (l.includes('title')) return 'type-title';
    if (l.includes('pre')) return 'type-pre-oral';
    if (l.includes('final')) return 'type-final';
    return 'type-unknown';
}

// ==========================================
// GRADES LOGIC (from instructor_grades.js)
// ==========================================

async function loadGrades() {
    const tableBody = document.getElementById('gradesTableBody');
    tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Loading grades...</td></tr>';
    try {
        const { data: groups, error } = await supabaseClient
            .from('student_groups')
            .select(`*, schedules (id, schedule_type), students ( id, full_name, grades ( grade, grade_type ) )`)
            .order('id', { ascending: false });
        if (error) throw error;
        allGradesData = groups || [];
        populateSectionFilter();
        renderGrades();
    } catch (err) {
        console.error('Error loading grades:', err);
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Error loading grades.</td></tr>';
    }
}

function populateSectionFilter() {
    const filter = document.getElementById('sectionFilter');
    const sections = [...new Set(allGradesData.map(g => g.section).filter(Boolean))].sort();
    while (filter.options.length > 1) filter.remove(1);
    sections.forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec; opt.textContent = sec; filter.appendChild(opt);
    });
}

function renderGrades() {
    const tableBody = document.getElementById('gradesTableBody');
    const searchTerm = document.getElementById('combinedSearchInput').value.toLowerCase();
    const typeF = document.getElementById('typeFilter').value;
    const sectionF = document.getElementById('sectionFilter').value;
    const programF = document.getElementById('programFilter').value;

    tableBody.innerHTML = '';
    let hasData = false;

    allGradesData.forEach(group => {
        const matchesS = group.group_name.toLowerCase().includes(searchTerm) || group.students.some(s => s.full_name.toLowerCase().includes(searchTerm));
        const matchesSec = sectionF === 'All' || group.section === sectionF;
        const matchesProg = programF === 'All' || group.program === programF;
        if (!matchesS || !matchesSec || !matchesProg || !group.schedules) return;

        group.schedules.forEach(sched => {
            if (typeF !== 'All' && sched.schedule_type !== typeF) return;
            const graded = group.students.map(s => {
                const g = (s.grades || []).find(gr => gr.grade_type === sched.schedule_type);
                return { name: s.full_name, grade: g ? g.grade : null, hasGrade: !!(g && (g.grade || g.grade === 0)) };
            });
            const gradedCount = graded.filter(s => s.hasGrade).length;
            if (gradedCount === 0) return;
            hasData = true;

            const total = group.students.length;
            const status = gradedCount === total ? 'Completed' : 'Partial';
            const statusClass = status === 'Completed' ? 'badge-completed' : 'badge-partial';
            const progClass = (group.program || '').toLowerCase().includes('bsis') ? 'prog-bsis' : (group.program || '').toLowerCase().includes('bsit') ? 'prog-bsit' : 'prog-bscs';
            const typeClass = getTypeClass(sched.schedule_type);
            const collId = `collapse-${group.id}-${sched.schedule_type.replace(/\s+/g, '')}`;

            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.onclick = () => toggleGradeRow(collId);
            row.innerHTML = `
                <td><div style="display:flex; align-items:center; gap:8px;"><span class="material-icons-round" style="font-size:18px; color:#94a3b8; transition:transform 0.2s;" id="icon-${collId}">chevron_right</span>${group.group_name}</div></td>
                <td><span class="type-badge ${typeClass}">${sched.schedule_type}</span></td>
                <td><span class="prog-badge ${progClass}">${group.program}</span></td>
                <td><span class="badge ${statusClass}">${status} (${gradedCount}/${total})</span></td>
                <td><div style="display:flex; gap:5px;"><button class="action-btn edit" onclick="event.stopPropagation(); openGradeModalForEdit(${group.id}, '${sched.schedule_type}')"><span class="material-icons-round">edit</span></button>
                    <button class="action-btn" onclick="event.stopPropagation(); printGroup(${group.id}, '${sched.schedule_type}')" style="color:var(--primary-color); background:#eff6ff;"><span class="material-icons-round">print</span></button></div></td>
            `;
            tableBody.appendChild(row);

            const detail = document.createElement('tr');
            detail.id = collId; detail.style.display = 'none'; detail.style.background = '#f8fafc';
            detail.innerHTML = `<td colspan="5" style="padding:15px 40px;"><div style="max-width:450px; background:white; padding:15px; border-radius:12px; border:1px solid #e2e8f0;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; color:var(--primary-dark); font-weight:700;"><span class="material-icons-round">assignment_ind</span>Grades Summary</div>
                ${graded.map(s => `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #edf2f7;"><span style="color:#4a5568;">${s.name}</span><span style="font-weight:700; color:var(--primary-color);">${s.grade !== null ? parseFloat(s.grade) : '-'}</span></div>`).join('')}
            </div></td>`;
            tableBody.appendChild(detail);
        });
    });
    if (!hasData) tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No grades found.</td></tr>';
}

function toggleGradeRow(id) {
    const r = document.getElementById(id);
    const i = document.getElementById('icon-' + id);
    const isHidden = r.style.display === 'none';
    r.style.display = isHidden ? 'table-row' : 'none';
    if (i) i.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
}

// ... Additional Grades Helper Functions ...
async function fetchGradeGroups(editId = null) {
    try {
        const { data, error } = await supabaseClient.from('student_groups').select(`*, schedules!inner(id, schedule_type), students ( id, grades ( id, grade_type ) )`).order('group_name', { ascending: true });
        if (error) throw error;
        const select = document.getElementById('gradeGroupId');
        select.innerHTML = '<option value="">Select Group</option>';
        data.forEach(g => {
            g.schedules.forEach(s => {
                const total = g.students.length;
                const graded = g.students.filter(st => st.grades?.some(gr => gr.grade_type === s.schedule_type)).length;
                if (graded === total && g.id != editId) return;
                const opt = document.createElement('option');
                opt.value = g.id; opt.textContent = `${g.group_name} (${s.schedule_type})`; opt.dataset.scheduleType = s.schedule_type;
                select.appendChild(opt);
            });
        });
    } catch (err) { console.error(err); }
}

window.handleGroupChange = async () => {
    const sel = document.getElementById('gradeGroupId');
    const gid = sel.value;
    const type = sel.options[sel.selectedIndex]?.dataset.scheduleType;
    const area = document.getElementById('gradingArea');
    document.getElementById('gradeForm').dataset.currentScheduleType = type;
    if (!gid) { area.innerHTML = '<p>Select a group.</p>'; return; }
    area.innerHTML = '<p>Loading...</p>';
    try {
        const { data: studs } = await supabaseClient.from('students').select(`id, full_name, grades ( id, grade, grade_type )`).eq('group_id', gid);
        area.innerHTML = `<div style="margin-bottom:10px; padding:10px; background:#e3f2fd; border-radius:8px; color:#1565c0; font-weight:600;">Grading for: ${type}</div>`;
        studs.forEach(s => {
            const gRec = s.grades?.find(gr => gr.grade_type === type);
            const div = document.createElement('div');
            div.className = 'student-grade-row';
            div.style = 'background:#f8f9fa; padding:12px; border-radius:10px; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;';
            div.innerHTML = `<div style="flex:1;"><h4 style="margin:0;">${s.full_name}</h4></div>
                <input type="hidden" name="studentId" value="${s.id}"><input type="hidden" name="gradeId" value="${gRec?.id || ''}">
                <div style="width:100px;"><input type="number" step="0.01" name="grade" value="${gRec?.grade ?? ''}" style="width:100%; padding:8px; border-radius:6px; border:1px solid #ddd; font-weight:bold;"></div>`;
            area.appendChild(div);
        });
    } catch (err) { console.error(err); }
};

window.saveGrades = async (e) => {
    e.preventDefault();
    const btn = document.querySelector('.btn-save');
    btn.disabled = true; btn.textContent = 'Saving...';
    const type = document.getElementById('gradeForm').dataset.currentScheduleType;
    try {
        const rows = document.querySelectorAll('.student-grade-row');
        const tasks = Array.from(rows).map(r => {
            const sid = r.querySelector('[name="studentId"]').value;
            const gid = r.querySelector('[name="gradeId"]').value;
            const val = r.querySelector('[name="grade"]').value;
            const data = { student_id: sid, grade: val === '' ? null : val, grade_type: type };
            return gid ? supabaseClient.from('grades').update(data).eq('id', gid) : (val !== '' ? supabaseClient.from('grades').insert(data) : Promise.resolve());
        });
        await Promise.all(tasks);
        closeGradeModal(); loadGrades();
    } catch (err) { showCustomAlert(err.message, "Error"); }
    finally { btn.textContent = 'Save Grades'; btn.disabled = false; }
};

window.openGradeModal = async () => {
    await fetchGradeGroups();
    document.getElementById('gradeForm').reset();
    document.getElementById('gradeGroupId').disabled = false;
    document.getElementById('gradeModal').classList.add('active');
};

window.openGradeModalForEdit = async (gid, type) => {
    await fetchGradeGroups(gid);
    const sel = document.getElementById('gradeGroupId');
    sel.disabled = true;
    for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value == gid && sel.options[i].dataset.scheduleType === type) { sel.selectedIndex = i; break; }
    }
    await handleGroupChange();
    document.getElementById('gradeModal').classList.add('active');
};

window.closeGradeModal = () => document.getElementById('gradeModal').classList.remove('active');

// --- Alert Modal ---
function showCustomAlert(msg, title = "Notice") {
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertMessage').textContent = msg;
    document.getElementById('alertModal').classList.add('active');
}
window.closeAlertModal = () => document.getElementById('alertModal').classList.remove('active');

// --- PRINTING ---
window.printReport = () => {
    const tF = document.getElementById('typeFilter').value;
    const sF = document.getElementById('sectionFilter').value;
    const pF = document.getElementById('programFilter').value;
    const sT = document.getElementById('combinedSearchInput').value.toLowerCase();

    if (tF === 'All') { showCustomAlert("Please select a specific Defense Type to print.", "Required"); return; }

    const list = [];
    allGradesData.forEach(g => {
        const matchesS = g.group_name.toLowerCase().includes(sT) || g.students.some(s => s.full_name.toLowerCase().includes(sT));
        if (matchesS && (sF === 'All' || g.section === sF) && (pF === 'All' || g.program === pF)) {
            g.schedules?.forEach(s => { if (s.schedule_type === tF) list.push({ group: g, scheduleType: s.schedule_type }); });
        }
    });

    if (list.length === 0) { showCustomAlert("No data found to print.", "Empty"); return; }

    document.getElementById('printReportTitle').textContent = `${tF} Academic Report - ${pF} Section ${sF}`;
    document.getElementById('printDate').textContent = `Generated: ${new Date().toLocaleString()}`;
    generatePrintTable(list);
    window.print();
};

window.printGroup = (gid, type) => {
    const g = allGradesData.find(x => x.id === gid);
    if (!g) return;
    document.getElementById('printReportTitle').textContent = `${type} Academic Report - Section ${g.section || 'N/A'}`;
    generatePrintTable([{ group: g, scheduleType: type }]);
    window.print();
};

function generatePrintTable(list) {
    let html = `<table style="width:100%; border-collapse:collapse; font-size:11px; margin-top:20px;">
        <thead><tr style="background:#f8fafc; border:1px solid #cbd5e1;">
            <th style="padding:10px; border:1px solid #cbd5e1;">GROUP</th><th style="padding:10px; border:1px solid #cbd5e1;">TYPE</th>
            <th style="padding:10px; border:1px solid #cbd5e1;">STUDENT</th><th style="padding:10px; border:1px solid #cbd5e1;">PROG</th>
            <th style="padding:10px; border:1px solid #cbd5e1;">SEC</th><th style="padding:10px; border:1px solid #cbd5e1;">GRADE</th>
        </tr></thead><tbody>`;
    list.forEach(item => {
        item.group.students.forEach(s => {
            const gr = s.grades?.find(g => g.grade_type === item.scheduleType);
            html += `<tr><td style="padding:8px; border:1px solid #cbd5e1; font-weight:700;">${item.group.group_name}</td>
                <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">${item.scheduleType}</td>
                <td style="padding:8px; border:1px solid #cbd5e1;">${s.full_name}</td>
                <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">${item.group.program}</td>
                <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">${item.group.section}</td>
                <td style="padding:8px; border:1px solid #cbd5e1; text-align:center; font-weight:700; color:#2563eb;">${gr ? parseFloat(gr.grade) : '-'}</td></tr>`;
        });
    });
    html += `</tbody></table>`;
    document.getElementById('printContent').innerHTML = html;
}

// --- Tooltip ---
function initTooltip() {
    if (document.getElementById('rubricTooltip')) return;
    const tip = document.createElement('div');
    tip.id = 'rubricTooltip';
    tip.style.cssText = `position:fixed; background:rgba(44,62,80,0.95); color:white; padding:12px; border-radius:8px; font-size:13px; max-width:300px; z-index:10000; display:none; pointer-events:none; box-shadow:0 4px 15px rgba(0,0,0,0.2); line-height:1.5; border-left:4px solid var(--accent-color);`;
    document.body.appendChild(tip);
}
