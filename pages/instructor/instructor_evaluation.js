// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Global State
let allData = [];
let loadedEvaluations = [];
let currentTypeFilter = 'ALL';
let rawGroups = [];
let allDefenseStatuses = [];

document.addEventListener('DOMContentLoaded', () => {
    loadEvaluations();
    initTooltip();
});

// Criteria Definitions
// Criteria Definitions with Detailed Rubrics
const individualCriteria = [
    {
        name: 'Clarity & Organization',
        rubrics: {
            4: 'Well-structured, clear transitions between topics, logical flow.',
            3: 'Mostly clear, with minor disorganization or unclear transitions.',
            2: 'Somewhat disorganized or unclear in parts, making it hard to follow.',
            1: 'Poorly organized, hard to follow or understand.'
        }
    },
    {
        name: 'Engagement',
        rubrics: {
            4: 'The presentation is very engaging. Group members keep the audience interested throughout.',
            3: 'The presentation is engaging for the most part, with minor lapses.',
            2: 'The presentation has a few engaging moments but lacks consistency.',
            1: 'The presentation is monotonous or disengaging.'
        }
    },
    {
        name: 'Delivery',
        rubrics: {
            4: 'Confident, natural delivery. Eye contact maintained, good pace, well-practiced.',
            3: 'Good delivery, but a bit hesitant or awkward at times.',
            2: 'Delivery is stiff or disjointed, with awkward pauses or excessive reading.',
            1: 'Unclear, rushed, or overly nervous delivery.'
        }
    },
    {
        name: 'Content Knowledge',
        rubrics: {
            4: 'Highly effective visuals that enhance understanding and support key points.',
            3: 'Visuals are clear and relevant, with some room for improvement.',
            2: 'Visuals are adequate but don\'t strongly support the presentation.',
            1: 'Visuals are unclear or distracting, with little relation to content.'
        }
    },
    {
        name: 'Team Collaboration',
        rubrics: {
            4: 'Excellent team coordination, each member contributes clearly and equally.',
            3: 'Most members contribute equally, with some minor imbalances.',
            2: 'Some members dominate the presentation, while others contribute minimally.',
            1: 'Team lacks cohesion, with unequal contributions or visible disconnects.'
        }
    },
    {
        name: 'Professionalism',
        rubrics: {
            4: 'Well-prepared, professional demeanor, answers questions confidently and competently.',
            3: 'Generally professional, but with minor lapses in preparation or handling questions.',
            2: 'Somewhat unprofessional or unprepared, struggles with questions.',
            1: 'Unprepared, unprofessional behavior or failure to answer questions.'
        }
    },
    {
        name: 'Time Management',
        rubrics: {
            4: 'Presentation adheres strictly to time limits, covering all necessary points concisely.',
            3: 'Minor overrun or rush at the end, but overall time was well-managed.',
            2: 'Presentation exceeds or fails to meet time expectations, lacking detail in some areas.',
            1: 'Presentation is too long or short, missing essential content.'
        }
    }
];

const systemCriteria = [
    {
        name: 'System Functionality',
        rubrics: {
            4: 'System is fully functional with all key features working as intended (at least 70% complete).',
            3: 'System is mostly functional with minor issues or missing features.',
            2: 'System has several non-functional or incomplete features.',
            1: 'System has major functionality issues or is incomplete.'
        }
    },
    {
        name: 'Technical Complexity',
        rubrics: {
            4: 'The system demonstrates a high level of technical skill and complexity (advanced features, integration, etc.).',
            3: 'System demonstrates solid technical skills but lacks advanced features.',
            2: 'Basic system with limited technical complexity or advanced concepts.',
            1: 'System lacks technical depth or fails to implement basic concepts.'
        }
    },
    {
        name: 'Usability',
        rubrics: {
            4: 'System is intuitive and user-friendly, easy to navigate and use.',
            3: 'System is mostly user-friendly, with minor usability issues.',
            2: 'System has some usability issues that make it difficult to use.',
            1: 'System is difficult to use or lacks clear user interface design.'
        }
    },
    {
        name: 'Code Quality & Organization',
        rubrics: {
            4: 'Code is well-structured, well-documented, and follows best practices.',
            3: 'Code is generally well-written but lacks documentation or could be better organized.',
            2: 'Code is functional but has readability or organizational issues.',
            1: 'Code is poorly written, hard to understand, or lacks necessary documentation.'
        }
    },
    {
        name: 'Innovation & Creativity',
        rubrics: {
            4: 'The system showcases innovative ideas or creative solutions to problems.',
            3: 'Some original ideas or creative approaches are evident.',
            2: 'Little innovation, relying mostly on standard solutions.',
            1: 'No creativity or innovation, very basic or copied ideas.'
        }
    },
    {
        name: 'Testing & Debugging',
        rubrics: {
            4: 'System is thoroughly tested with no major bugs or errors.',
            3: 'System has been tested with few minor issues remaining.',
            2: 'Some testing was done, but there are bugs or issues that hinder functionality.',
            1: 'Little to no testing, system is full of bugs or crashes.'
        }
    },
    {
        name: 'Documentation & Reporting',
        rubrics: {
            4: 'Clear, comprehensive documentation that includes detailed explanations of system design, code, and usage.',
            3: 'Good documentation, but may lack detail in some areas.',
            2: 'Documentation is minimal or unclear, with gaps in explanations.',
            1: 'No documentation, or it is incomplete and unhelpful.'
        }
    },
    {
        name: 'System Presentation/Demo',
        rubrics: {
            4: 'The system is demonstrated effectively, with a clear explanation of how it works and what each feature does.',
            3: 'The system is demonstrated well but may have minor gaps in explanation.',
            2: 'System is demonstrated, but the explanation is unclear or incomplete.',
            1: 'System is not demonstrated, or demo fails to work properly.'
        }
    }
];

async function loadEvaluations() {
    const accordionContainer = document.getElementById('accordionContainer');
    // We don't overwrite innerHTML immediately because we might be in Advisory mode
    // But initially, loading...

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
        rawGroups = groups || []; // Store for Advisory View

        // 2. Fetch Defense Statuses (For Advisory View)
        const { data: statuses } = await supabaseClient
            .from('defense_statuses')
            .select('*');
        allDefenseStatuses = statuses || [];

        // 3. Fetch ALL Submitted Evaluations (For Evaluation View)
        const { data: indScores } = await supabaseClient
            .from('individual_evaluations')
            .select('*');

        const { data: sysScores } = await supabaseClient
            .from('system_evaluations')
            .select('*');

        // 4. Process Data for Evaluations View
        let processedEvaluations = [];

        (groups || []).forEach(group => {
            const schedules = group.schedules || [];

            schedules.forEach(sched => {
                const relevantIndScores = (indScores || []).filter(s => s.schedule_id === sched.id);
                const panelistsWhoRated = [...new Set(relevantIndScores.map(s => s.panelist_name))];

                const relevantSysScores = (sysScores || []).filter(s => s.schedule_id === sched.id);
                const panelistsSys = relevantSysScores.map(s => s.panelist_name);

                const allRaters = [...new Set([...panelistsWhoRated, ...panelistsSys])];

                let dType = sched.schedule_type || 'Defense';
                if (dType.toLowerCase().endsWith(' defense')) {
                    dType = dType.substring(0, dType.length - 8).trim();
                }

                allRaters.forEach(panelistName => {
                    processedEvaluations.push({
                        id: sched.id + '-' + panelistName.replace(/\s+/g, ''),
                        schedId: sched.id,
                        groupId: group.id,
                        groupName: group.group_name,
                        program: group.program,
                        members: group.students || [],
                        title: group.title,
                        defenseType: dType,
                        panelistName: panelistName,
                        roles: { panel: true },
                        isSubmitted: true,
                        adviser: group.adviser,
                        createdBy: group.created_by || group.user_id,
                        savedScores: {
                            individual: (indScores || []).filter(s => s.schedule_id === sched.id && s.panelist_name.toLowerCase() === panelistName.toLowerCase()),
                            system: (sysScores || []).find(s => s.schedule_id === sched.id && s.panelist_name.toLowerCase() === panelistName.toLowerCase())
                        }
                    });
                });
            });
        });

        loadedEvaluations = processedEvaluations;

        // Initial Render based on Tab
        if (window.switchMainTab) {
            window.switchMainTab(currentMainTab);
        } else {
            applyFilters();
        }

    } catch (err) {
        console.error('Error loading data:', err);
        if (accordionContainer) accordionContainer.innerHTML = '<p style="text-align: center; color: red;">Error loading data.</p>';
    }
}

// --- Main Tab Logic ---
let currentMainTab = 'Evaluation'; // Default to All

window.switchMainTab = (tab) => {
    currentMainTab = 'Evaluation';

    const filterContainer = document.querySelector('.filter-container');
    const accordion = document.getElementById('accordionContainer');

    // Always show filters
    if (filterContainer) filterContainer.style.display = 'flex';
    if (accordion) accordion.style.display = 'block';

    applyFilters();
}

function renderAdvisoryTable() {
    const tbody = document.getElementById('advisoryTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Get User
    const userJson = localStorage.getItem('loginUser');
    const user = userJson ? JSON.parse(userJson) : null;
    const userName = (user ? (user.full_name || '') : '').toLowerCase();

    // Filter Groups where I am Adviser
    const myAdviseeGroups = rawGroups.filter(g => {
        const adv = (g.adviser || '').toLowerCase();
        return adv.includes(userName) || (userName && userName.includes(adv));
    });

    if (myAdviseeGroups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No groups assigned to you as Adviser.</td></tr>';
        return;
    }

    let hasGlobalData = false;

    myAdviseeGroups.forEach(group => {
        const schedules = group.schedules || [];

        let targetSched = null;
        let displayType = '';

        // Determine which schedule to show based on filter
        if (currentTypeFilter !== 'ALL') {
            if (currentTypeFilter === 'title') targetSched = schedules.find(s => s.schedule_type && s.schedule_type.includes('Title'));
            if (currentTypeFilter === 'pre') targetSched = schedules.find(s => s.schedule_type && s.schedule_type.includes('Pre'));
            // The filter uses 'final' but schedule_type matches 'Final'
            if (currentTypeFilter === 'final') targetSched = schedules.find(s => s.schedule_type && s.schedule_type.includes('Final'));

            if (!targetSched) return; // Skip group if no match
            displayType = targetSched.schedule_type;
        } else {
            // Default Priority: Final > Pre > Title
            const titleSched = schedules.find(s => s.schedule_type && s.schedule_type.includes('Title'));
            const preSched = schedules.find(s => s.schedule_type && s.schedule_type.includes('Pre'));
            const finalSched = schedules.find(s => s.schedule_type && s.schedule_type.includes('Final'));

            if (finalSched) { targetSched = finalSched; displayType = 'Final Defense'; }
            else if (preSched) { targetSched = preSched; displayType = 'Pre-Oral Defense'; }
            else if (titleSched) { targetSched = titleSched; displayType = 'Title Defense'; }
            else {
                // No schedule found implies "Not Scheduled"
                displayType = 'Title Defense';
            }
        }

        hasGlobalData = true; // Found at least one item

        let displayStatus = 'Not Scheduled';
        if (targetSched) {
            const statusRecord = allDefenseStatuses.find(ds => ds.schedule_id === targetSched.id);
            if (statusRecord) {
                // Check if actually finished or ongoing?
                // For now, if record exists, it's "Scheduled" or "Under Evaluation" ??
                // Panel says "Scheduled" in image.
                displayStatus = 'Scheduled';

                // Refine if needed: if (statusRecord.verdict) ...
            } else {
                displayStatus = 'Scheduled'; // If explicit schedule exists in 'schedules' table, it is scheduled.
            }
        } else {
            // No schedule object found
            if (displayType) displayStatus = 'Not Scheduled';
        }

        // Get Title safely
        let title = group.title;
        if (typeof title === 'object' && title !== null) {
            title = title.title1 || title.title2 || Object.values(title)[0] || '';
        } else if (typeof title === 'string' && title.startsWith('{')) {
            try { const t = JSON.parse(title); title = t.title1 || Object.values(t)[0] || title; } catch (e) { }
        }

        // Truncate title if clean
        if (title && title.length > 50) title = title.substring(0, 50) + '...';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span style="font-weight:600; color:var(--primary-color);">${title || 'Untitled'}</span></td>
            <td>${group.group_name}</td>
            <td>
                <div class="chips-container">
                    ${(group.students || []).map(m => `<span class="chip">${m.full_name}</span>`).join('')}
                </div>
            </td>
            <td><span class="type-badge ${getTypeClass(displayType || 'Defense')}">${displayType || 'N/A'}</span></td>
            <td><span class="status-badge ${displayStatus === 'Not Scheduled' ? 'rejected' : 'pending'}">${displayStatus}</span></td>
        `;
        tbody.appendChild(row);
    });

    if (!hasGlobalData) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No records found for this filter.</td></tr>';
    }
}

function getTypeClass(type) {
    type = type.toLowerCase();
    if (type.includes('title')) return 'type-title';
    if (type.includes('pre')) return 'type-pre-oral';
    if (type.includes('final')) return 'type-final';
    return 'type-unknown';
}

// Search Filter
// Search Filter
document.getElementById('searchInput')?.addEventListener('input', () => {
    applyFilters();
});

window.setFilter = (type, btn) => {
    currentTypeFilter = type;

    // Visual Update
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (currentMainTab === 'Advisory') {
        renderAdvisoryTable();
    } else {
        applyFilters();
    }
};

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    // Get User Info for Tab Filtering
    const userJson = localStorage.getItem('loginUser');
    const user = userJson ? JSON.parse(userJson) : null;
    const userName = user ? (user.full_name || '').toLowerCase() : '';
    const userId = user ? user.id : '';

    const filtered = loadedEvaluations.filter(ev => {
        // 1. Main Tab Filter (Advisory vs Evaluation)
        let matchesMain = true;
        const adviser = (ev.adviser || '').toLowerCase();
        const isAdviser = adviser.includes(userName) || (userName && userName.includes(adviser));
        const isPanelist = (ev.panelistName || '').toLowerCase() === userName.toLowerCase();

        if (currentMainTab === 'Advisory') {
            // Must be the Adviser of the group being evaluated
            matchesMain = isAdviser;
        } else {
            // "Evaluation" tab: Hide panel evaluations from the group's Adviser
            // If you ARE the adviser but NOT the panelist who rated this, you can't see it.
            if (isAdviser && !isPanelist) {
                matchesMain = false;
            } else {
                matchesMain = true;
            }
        }
        if (!matchesMain) return false;

        // 2. Text Match
        const matchesText = ev.groupName.toLowerCase().includes(searchTerm) ||
            ev.panelistName.toLowerCase().includes(searchTerm) ||
            ev.defenseType.toLowerCase().includes(searchTerm);

        // 3. Type Match
        let matchesType = true;
        const dType = ev.defenseType.toLowerCase();

        if (currentTypeFilter === 'title') {
            matchesType = dType.includes('title');
        } else if (currentTypeFilter === 'pre') {
            matchesType = dType.includes('pre') && (dType.includes('oral') || dType.includes('defense'));
        } else if (currentTypeFilter === 'final') {
            matchesType = dType.includes('final');
        }

        return matchesText && matchesType;
    });

    renderAccordions(filtered);
}

function renderAccordions(evaluations) {
    const container = document.getElementById('accordionContainer');
    container.innerHTML = '';

    evaluations.forEach(evalItem => {
        const card = document.createElement('div');
        card.className = 'evaluation-card';

        // Defense Type Badge
        let typeClass = 'type-unknown';
        const lowerType = evalItem.defenseType.toLowerCase();
        if (lowerType.includes('title')) typeClass = 'type-title';
        else if (lowerType.includes('pre-oral') || lowerType.includes('pre oral')) typeClass = 'type-pre-oral';
        else if (lowerType.includes('final')) typeClass = 'type-final';

        // Get Program from members if available, or assume from group (need to check data structure)
        // Since we don't have program directly in evalItem, let's look at how it's loaded
        // In loadEvaluations, we fetch *, which includes program.
        const program = (evalItem.program || '').toUpperCase();
        let progClass = 'prog-unknown';
        if (program.includes('BSIS')) progClass = 'prog-bsis';
        else if (program.includes('BSIT')) progClass = 'prog-bsit';
        else if (program.includes('BSCS')) progClass = 'prog-bscs';

        card.innerHTML = `
             <div class="card-header" onclick="toggleAccordion('${evalItem.id}')">
                 <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div class="header-info">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="group-name">${evalItem.groupName}</span>
                            <span class="prog-badge ${progClass}">${program}</span>
                        </div>
                        <div style="font-size: 0.9rem; color: #64748b; margin-top: 4px;">
                            Rated by: <strong style="color: var(--primary-color);">${evalItem.panelistName}</strong>
                        </div>
                        <div style="margin-top: 8px;">
                            <span class="type-badge ${typeClass}">${evalItem.defenseType}</span>
                        </div>
                    </div>
                    <span class="material-icons-round expand-icon" id="icon-${evalItem.id}" style="color: #9ca3af; transition: transform 0.3s; font-size: 24px;">expand_more</span>
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
                <td class="criteria-cell" style="text-align: left; background: #fafafa;">
                    <div style="font-weight: 600; display: flex; align-items: center; gap: 8px;">
                         <span style="flex: 1;">${c.name}</span>
                         <span class="material-icons-round tooltip-trigger" 
                               style="font-size: 18px; color: #cbd5e1; cursor: help;"
                               onmouseover="showRubricTip(event, '${c.name}');" 
                               onmouseout="hideRubricTip();">
                               help_outline
                         </span>
                    </div>
                </td>
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
        // Safe access to score
        let scoreVal = '-';
        if (evalItem.savedScores && evalItem.savedScores.system) {
            scoreVal = evalItem.savedScores.system[sysCols[cIdx]];
            if (scoreVal === undefined || scoreVal === null) scoreVal = '-';
        }

        const inputArea = `<div style="font-weight: 800; color: var(--primary-color); text-align: center; font-size: 1.1rem;">${scoreVal}</div>`;

        rows += `
            <tr>
                <td class="criteria-cell" style="text-align: left; background: #fafafa;">
                    <div style="font-weight: 600; font-size: 0.95rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                         <span style="flex: 1;">${c.name}</span>
                         <span class="material-icons-round tooltip-trigger" 
                               style="font-size: 18px; color: #cbd5e1; cursor: help;"
                               onmouseover="showRubricTip(event, '${c.name}', true);" 
                               onmouseout="hideRubricTip();">
                               help_outline
                         </span>
                    </div>
                </td>
                <td style="background: #f8fbff; width: 120px;">${inputArea}</td>
            </tr>
        `;
    });

    const totalVal = (evalItem.savedScores && evalItem.savedScores.system) ? evalItem.savedScores.system.total_score : 0;

    return `
        <div style="margin-bottom: 20px; border-bottom: 2px dashed #f1f5f9; padding-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="material-icons-round" style="color: var(--primary-color); font-size: 26px;">dvr</span>
                <div>
                    <h4 style="color: var(--text-main); font-size: 1.1rem; font-weight: 800; margin: 0;">System Project Evaluation</h4>
                    <p style="font-size: 0.8rem; color: #64748b; margin: 2px 0 0;">Evaluation of the project's overall implementation and documentation.</p>
                </div>
            </div>
        </div>
        <div class="table-responsive" style="max-width: 700px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
            <table class="eval-table" style="min-width: unset; width: 100%;">
                <thead>
                    <tr style="background: #f8fbff; border-bottom: 1px solid #e2e8f0;">
                        <th class="criteria-header" style="font-size: 0.95rem; font-weight: 700; color: #0f172a; padding: 16px 20px;">Technical Criteria</th>
                        <th style="width: 140px; font-size: 0.95rem; font-weight: 700; color: #0f172a; text-align: center;">Score</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                    <tr style="background: #f1f5f9; border-top: 1px solid #e2e8f0;">
                        <td style="text-align: right; padding: 16px 25px; font-weight: 800; color: #334155; font-size: 0.95rem; letter-spacing: 0.5px; text-transform: uppercase;">TOTAL SYSTEM SCORE</td>
                        <td style="font-weight: 900; font-size: 1.3rem; color: var(--primary-color); text-align: center; padding: 16px;">${totalVal}</td>
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

// --- Custom Rubric Tooltip Logic ---
function initTooltip() {
    if (!document.getElementById('rubricTooltip')) {
        const tip = document.createElement('div');
        tip.id = 'rubricTooltip';
        tip.style.cssText = `
            position: fixed;
            background: rgba(44, 62, 80, 0.95);
            color: white;
            padding: 12px 18px;
            border-radius: 8px;
            font-size: 13px;
            max-width: 300px;
            z-index: 10000;
            display: none;
            pointer-events: none;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            line-height: 1.5;
            transition: opacity 0.2s;
            border-left: 4px solid var(--accent-color);
        `;
        document.body.appendChild(tip);
    }
}

window.showRubricTip = (event, criteriaName, isSystem = false) => {
    initTooltip();
    const criteria = isSystem
        ? systemCriteria.find(c => c.name === criteriaName)
        : individualCriteria.find(c => c.name === criteriaName);

    if (!criteria) return;

    const tip = document.getElementById('rubricTooltip');
    tip.innerHTML = `
        <div style="font-weight: 700; margin-bottom: 12px; color: #ffcc00; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
            ${criteriaName} Rubric
        </div>
        <div style="display: grid; gap: 10px;">
            <div style="font-size: 12px;"><strong style="color: #4ade80;">4 - Excellent:</strong><br> <span style="opacity: 0.95;">${criteria.rubrics[4]}</span></div>
            <div style="font-size: 12px;"><strong style="color: #fbbf24;">3 - Good:</strong><br> <span style="opacity: 0.95;">${criteria.rubrics[3]}</span></div>
            <div style="font-size: 12px;"><strong style="color: #f87171;">2 - Fair:</strong><br> <span style="opacity: 0.95;">${criteria.rubrics[2]}</span></div>
            <div style="font-size: 12px;"><strong style="color: #ef4444;">1 - Needs Improvement:</strong><br> <span style="opacity: 0.95;">${criteria.rubrics[1]}</span></div>
        </div>
    `;

    tip.style.display = 'block';
    tip.style.maxWidth = '380px';
    tip.style.width = '380px';

    // Position intelligently
    const rect = event.currentTarget.getBoundingClientRect();
    const tipWidth = 380;

    // Show to the right of the hovered item
    let x = rect.right + 20;
    let y = event.clientY - 50;

    // If it would go off the right edge, show it to the left
    if (x + tipWidth > window.innerWidth) {
        x = rect.left - tipWidth - 20;
    }

    // Ensure it doesn't go off bottom
    const tipHeight = tip.offsetHeight || 300;
    if (y + tipHeight > window.innerHeight) {
        y = window.innerHeight - tipHeight - 20;
    }
    if (y < 20) y = 20;

    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
};

window.hideRubricTip = () => {
    const tip = document.getElementById('rubricTooltip');
    if (tip) tip.style.display = 'none';
};
