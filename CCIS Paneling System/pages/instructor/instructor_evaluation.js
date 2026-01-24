// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Global State
let allData = [];
let loadedEvaluations = [];

document.addEventListener('DOMContentLoaded', () => {
    loadEvaluations();
});

// Criteria Definitions
const individualCriteria = [
    {
        name: 'Clarity & Organization',
        rubrics: { 4: 'Well-structured...', 3: 'Mostly clear...', 2: 'Somewhat disorganized...', 1: 'Poorly organized...' }
    },
    {
        name: 'Engagement',
        rubrics: { 4: 'Very engaging...', 3: 'Engaging...', 2: 'Some engagement...', 1: 'Monotonous...' }
    },
    {
        name: 'Delivery',
        rubrics: { 4: 'Confident...', 3: 'Good delivery...', 2: 'Stiff...', 1: 'Unclear...' }
    },
    {
        name: 'Content Knowledge',
        rubrics: { 4: 'Highly effective visuals...', 3: 'Clear visuals...', 2: 'Adequate...', 1: 'Unclear visuals...' }
    },
    {
        name: 'Team Collaboration',
        rubrics: { 4: 'Excellent...', 3: 'Most contribute...', 2: 'Some dominate...', 1: 'Lacks cohesion...' }
    },
    {
        name: 'Professionalism',
        rubrics: { 4: 'Well-prepared...', 3: 'Generally professional...', 2: 'Somewhat unprofessional...', 1: 'Unprepared...' }
    },
    {
        name: 'Time Management',
        rubrics: { 4: 'Adheres strictly...', 3: 'Minor overrun...', 2: 'Exceeds time...', 1: 'Too long/short...' }
    }
];

const systemCriteria = [
    { name: 'System Functionality', rubrics: { 4: 'text', 3: 'text', 2: 'text', 1: 'text' } },
    { name: 'Technical Complexity', rubrics: { 4: 'text', 3: 'text', 2: 'text', 1: 'text' } },
    { name: 'Usability', rubrics: { 4: 'text', 3: 'text', 2: 'text', 1: 'text' } },
    { name: 'Code Quality & Organization', rubrics: { 4: 'text', 3: 'text', 2: 'text', 1: 'text' } },
    { name: 'Innovation & Creativity', rubrics: { 4: 'text', 3: 'text', 2: 'text', 1: 'text' } },
    { name: 'Testing & Debugging', rubrics: { 4: 'text', 3: 'text', 2: 'text', 1: 'text' } },
    { name: 'Documentation & Reporting', rubrics: { 4: 'text', 3: 'text', 2: 'text', 1: 'text' } },
    { name: 'System Presentation/Demo', rubrics: { 4: 'text', 3: 'text', 2: 'text', 1: 'text' } }
];

async function loadEvaluations() {
    const accordionContainer = document.getElementById('accordionContainer');
    accordionContainer.innerHTML = '<p style="text-align: center; color: #888;">Loading evaluation history...</p>';

    try {
        // 1. Fetch Groups + their Schedules + Students
        const { data: groups, error } = await supabaseClient
            .from('student_groups')
            .select(`
                *,
                students ( id, full_name ),
                schedules (
                    id,
                    schedule_type,
                    panel1, panel2, panel3, panel4, panel5
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // 2. Fetch ALL Submitted Evaluations
        const { data: indScores } = await supabaseClient
            .from('individual_evaluations')
            .select('*');

        const { data: sysScores } = await supabaseClient
            .from('system_evaluations')
            .select('*');

        // 3. Process Data: We need to create an "Evaluation Item" for each (Schedule + Panelist) pair that exists in the scores
        let processedEvaluations = [];

        (groups || []).forEach(group => {
            const schedules = group.schedules || [];

            schedules.forEach(sched => {
                // Find all panelists who have rated this schedule
                // We check individual_evaluations for this schedule_id
                const relevantIndScores = (indScores || []).filter(s => s.schedule_id === sched.id);
                // Get unique panelists
                const panelistsWhoRated = [...new Set(relevantIndScores.map(s => s.panelist_name))];

                // Also check system scores just in case
                const relevantSysScores = (sysScores || []).filter(s => s.schedule_id === sched.id);
                const panelistsSys = relevantSysScores.map(s => s.panelist_name);

                // Merge lists
                const allRaters = [...new Set([...panelistsWhoRated, ...panelistsSys])];

                let dType = sched.schedule_type || 'Defense';
                if (dType.toLowerCase().endsWith(' defense')) {
                    dType = dType.substring(0, dType.length - 8).trim();
                }

                allRaters.forEach(panelistName => {
                    processedEvaluations.push({
                        id: sched.id + '-' + panelistName.replace(/\s+/g, ''), // Unique DOM ID
                        schedId: sched.id,
                        groupId: group.id,
                        groupName: group.group_name,
                        members: group.students || [],
                        title: group.title,
                        defenseType: dType,
                        panelistName: panelistName, // The specific evaluator
                        roles: { panel: true }, // Force true for display
                        isSubmitted: true,
                        savedScores: {
                            individual: (indScores || []).filter(s => s.schedule_id === sched.id && s.panelist_name === panelistName),
                            system: (sysScores || []).find(s => s.schedule_id === sched.id && s.panelist_name === panelistName)
                        }
                    });
                });
            });
        });

        if (processedEvaluations.length === 0) {
            accordionContainer.innerHTML = '<div class="empty-state"><span class="material-icons-round">history</span><p>No submitted evaluations found yet.</p></div>';
            return;
        }

        loadedEvaluations = processedEvaluations;
        renderAccordions(processedEvaluations);

    } catch (err) {
        console.error('Error loading data:', err);
        accordionContainer.innerHTML = '<p style="text-align: center; color: red;">Error loading evaluations.</p>';
    }
}

// Search Filter
document.getElementById('searchInput')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = loadedEvaluations.filter(ev =>
        ev.groupName.toLowerCase().includes(term) ||
        ev.panelistName.toLowerCase().includes(term) ||
        ev.defenseType.toLowerCase().includes(term)
    );
    renderAccordions(filtered);
});

function renderAccordions(evaluations) {
    const container = document.getElementById('accordionContainer');
    container.innerHTML = '';

    evaluations.forEach(evalItem => {
        const card = document.createElement('div');
        card.className = 'evaluation-card';

        const dBadgeClass = evalItem.defenseType.toLowerCase().includes('title') ? 'title-defense' :
            (evalItem.defenseType.toLowerCase().includes('pre-oral') || evalItem.defenseType.toLowerCase().includes('pre oral')) ? 'pre-oral' :
                evalItem.defenseType.toLowerCase().includes('final') ? 'final-defense' : 'title-defense';

        card.innerHTML = `
             <div class="card-header" onclick="toggleAccordion('${evalItem.id}')">
                 <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div class="header-info">
                        <span class="group-name">${evalItem.groupName}</span>
                        <div style="font-size: 0.9rem; color: #64748b; margin-top: 4px;">
                            Rated by: <strong style="color: var(--primary-color);">${evalItem.panelistName}</strong>
                        </div>
                        <span class="defense-badge ${dBadgeClass}">${evalItem.defenseType}</span>
                    </div>
                    <span class="material-icons-round expand-icon" id="icon-${evalItem.id}" style="color: #9ca3af; transition: transform 0.3s;">expand_more</span>
                 </div>
             </div>
             <div class="card-body" id="body-${evalItem.id}" style="display: none;">
                 <div class="card-content">
                     ${getCardContent(evalItem)}
                 </div>
             </div>
         `;
        container.appendChild(card);
    });
}

function getCardContent(evalItem) {
    const type = (evalItem.defenseType || '').toLowerCase();
    const isMultiPage = type.includes('pre oral') || type.includes('pre-oral') || type.includes('final');

    let html = '';

    // Switcher Tabs for Multi-page (Read Only)
    if (isMultiPage) {
        html += `
            <div class="switcher-tabs">
                <button class="switcher-btn active" id="btn-p1-${evalItem.id}" onclick="switchPage('${evalItem.id}', 1)">
                    <span class="material-icons-round">person</span> Individual
                </button>
                <button class="switcher-btn" id="btn-p2-${evalItem.id}" onclick="switchPage('${evalItem.id}', 2)">
                    <span class="material-icons-round">dvr</span> System Project
                </button>
            </div>
        `;
    }

    // Step 1: Individual Rating
    html += `<div class="eval-step active" id="step1-${evalItem.id}">`;
    html += renderIndividualTable(evalItem);

    if (isMultiPage) {
        html += `
            <div style="margin-top: 25px; text-align: right; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                <button class="btn-save" onclick="switchPage('${evalItem.id}', 2)" 
                        style="padding: 12px 24px; border-radius: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 10px; box-shadow: 0 4px 12px rgba(26, 86, 219, 0.2);">
                    View System Project 
                    <span class="material-icons-round" style="font-size: 20px;">arrow_forward</span>
                </button>
            </div>
        `;
    }
    html += `</div>`;

    // Step 2: System Rating
    if (isMultiPage) {
        html += `<div class="eval-step" id="step2-${evalItem.id}">`;
        html += renderSystemTable(evalItem);
        html += `
            <div style="margin-top: 30px; display: flex; justify-content: flex-start; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 25px;">
                <button class="btn-cancel" onclick="switchPage('${evalItem.id}', 1)" 
                        style="padding: 12px 24px; border-radius: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; border: 1.5px solid #e2e8f0; background: white; color: #64748b;">
                    <span class="material-icons-round" style="font-size: 20px;">arrow_back</span>
                    Back to Individual
                </button>
            </div>
        </div>`;
    }

    return html;
}

function renderIndividualTable(evalItem) {
    let headerCols = '';
    evalItem.members.forEach((student, idx) => {
        headerCols += `<th>${student.full_name}<br><span style="font-size: 10px; color: #9ca3af; font-weight: 400; text-transform: none;">Presenter ${idx + 1}</span></th>`;
    });

    const columns = ['clarity_score', 'engagement_score', 'delivery_score', 'knowledge_score', 'collab_score', 'prof_score', 'time_score'];

    let rows = '';
    individualCriteria.forEach((c, cIdx) => {
        let inputs = '';
        evalItem.members.forEach((student, mIdx) => {
            const savedScoreObj = evalItem.savedScores.individual.find(s => s.student_id === student.id);
            const scoreVal = savedScoreObj ? savedScoreObj[columns[cIdx]] : 0;
            inputs += `<td style="font-weight: 600; color: #374151;">${scoreVal || '-'}</td>`;
        });
        rows += `
            <tr>
                <td style="font-weight: 600; text-align: left; background: #fafafa; color: var(--text-main);">${c.name}</td>
                ${inputs}
            </tr>
        `;
    });

    // Total Row
    let totalCells = '';
    evalItem.members.forEach((student, mIdx) => {
        let total = 0;
        const saved = evalItem.savedScores.individual.find(s => s.student_id === student.id);
        total = saved ? saved.total_score : 0;
        totalCells += `<td style="font-weight: 800; font-size: 1.1rem; color: var(--primary-color);">${total}</td>`;
    });

    return `
        <div style="margin-bottom: 25px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                <span class="material-icons-round" style="color: var(--primary-color);">person_outline</span>
                <h4 style="color: var(--text-main); font-size: 1.05rem; font-weight: 700;">Individual Rating of Presenters</h4>
            </div>
        </div>
        <div class="table-responsive">
            <table class="eval-table">
                <thead>
                    <tr>
                        <th class="criteria-header">Evaluation Criteria</th>
                        ${headerCols}
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                    <tr style="background: #f8fbff;">
                        <td style="text-align: right; padding-right: 20px; font-weight: 800; color: var(--primary-dark);">TOTAL INDIVIDUAL SCORE</td>
                        ${totalCells}
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

function renderSystemTable(evalItem) {
    const sysCols = ['func_score', 'tech_score', 'usability_score', 'code_score', 'innov_score', 'testing_score', 'docu_score', 'demo_score'];

    let rows = '';
    systemCriteria.forEach((c, cIdx) => {
        let inputArea = '';
        const scoreVal = evalItem.savedScores.system ? evalItem.savedScores.system[sysCols[cIdx]] : 0;
        inputArea = `<div style="font-weight: 800; color: var(--primary-color); text-align: center; font-size: 1.1rem;">${scoreVal || '-'}</div>`;

        rows += `
            <tr>
                <td style="font-weight: 700; text-align: left; background: #f8fbff; color: var(--primary-dark); width: 180px;">${c.name}</td>
                <td style="font-size: 0.75rem; color: #475569; text-align: left; line-height: 1.4; padding: 12px 10px;">${c.rubrics[4]}</td>
                <td style="font-size: 0.75rem; color: #475569; text-align: left; line-height: 1.4; padding: 12px 10px;">${c.rubrics[3]}</td>
                <td style="font-size: 0.75rem; color: #475569; text-align: left; line-height: 1.4; padding: 12px 10px;">${c.rubrics[4]}</td>
                <td style="font-size: 0.75rem; color: #475569; text-align: left; line-height: 1.4; padding: 12px 10px;">${c.rubrics[1]}</td>
                <td style="background: #f8fbff; width: 80px;">${inputArea}</td>
            </tr>
        `;
    });

    const totalVal = evalItem.savedScores.system ? evalItem.savedScores.system.total_score : 0;

    return `
        <div style="margin-bottom: 25px; border-bottom: 2px dashed #f1f5f9; padding-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="material-icons-round" style="color: var(--primary-color); font-size: 28px;">dvr</span>
                <div>
                    <h4 style="color: var(--text-main); font-size: 1.1rem; font-weight: 800; margin: 0;">System Project Evaluation</h4>
                    <p style="font-size: 0.8rem; color: #64748b; margin: 2px 0 0;">Evaluation of the project's overall implementation and documentation.</p>
                </div>
            </div>
        </div>
        <div class="table-responsive" style="max-width: 600px; margin: 0 auto;">
            <table class="eval-table">
                <thead>
                    <tr style="background: #f8fbff;">
                        <th class="criteria-header">Technical Criteria</th>
                        <th style="width: 140px;">Score</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                    <tr style="background: #f1f5f9;">
                        <td style="text-align: right; padding-right: 25px; font-weight: 800; color: var(--primary-dark); font-size: 1rem;">TOTAL SYSTEM SCORE</td>
                        <td style="font-weight: 900; font-size: 1.25rem; color: var(--primary-color); text-align: center;">${totalVal}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

// Helpers
window.toggleAccordion = (id) => {
    const body = document.getElementById(`body-${id}`);
    const icon = document.getElementById(`icon-${id}`);

    if (body.style.display === 'none') {
        body.style.display = 'block';
        icon.textContent = 'expand_less';
        icon.style.color = 'var(--primary-color)';
    } else {
        body.style.display = 'none';
        icon.textContent = 'expand_more';
        icon.style.color = '#888';
    }
};

window.switchPage = (id, page) => {
    const step1 = document.getElementById(`step1-${id}`);
    const step2 = document.getElementById(`step2-${id}`);
    const btn1 = document.getElementById(`btn-p1-${id}`);
    const btn2 = document.getElementById(`btn-p2-${id}`);

    if (page === 1) {
        step1.classList.add('active');
        step2?.classList.remove('active'); // Optional chaining if single page
        btn1?.classList.add('active');
        btn2?.classList.remove('active');
    } else {
        step1.classList.remove('active');
        step2.classList.add('active');
        btn1.classList.remove('active');
        btn2.classList.add('active');
    }
};
