// Initialize Supabase client
var PROJECT_URL = PROJECT_URL || 'https://oddzwiddvniejcawzpwi.supabase.co';
var PUBLIC_KEY = PUBLIC_KEY || 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
var supabaseClient = supabaseClient || window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Global State
let allData = [];
let loadedEvaluations = [];
let currentStatusFilter = 'pending'; // Default view: To Be Evaluated
let currentPage = 1;
const rowsPerPage = 15;

document.addEventListener('DOMContentLoaded', async () => {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser) {
        window.location.href = '../../';
        return;
    }

    const rawRole = (loginUser && loginUser.role) ? loginUser.role.toString().toLowerCase() : '';
    const userName = loginUser.name || loginUser.full_name || '';

    // Simply load evaluations
    loadEvaluations();

    loadEvaluations();
});


// Criteria Definitions with Detailed Rubrics (From Images)
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
    accordionContainer.innerHTML = '<p style="text-align: center; color: #888;">Loading defense schedules...</p>';

    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser) {
        window.location.href = '../../';
        return;
    }
    const userNameRaw = loginUser.name || loginUser.full_name || 'Panel';

    try {
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

        const { data: indScores } = await supabaseClient
            .from('individual_evaluations')
            .select('*')
            .eq('panelist_name', loginUser.name);

        const { data: sysScores } = await supabaseClient
            .from('system_evaluations')
            .select('*')
            .eq('panelist_name', loginUser.name);

        const currentUserNormalized = String(userNameRaw).trim().toLowerCase();

        const fuzzyMatch = (nameA, nameB) => {
            const nA = String(nameA || "").trim().toLowerCase();
            const nB = String(nameB || "").trim().toLowerCase();
            if (!nA || !nB) return false;
            if (nA === nB) return true;
            const wA = nA.split(/\s+/).filter(w => w);
            const wB = nB.split(/\s+/).filter(w => w);
            if (wA.length <= wB.length) return wA.every(word => wB.includes(word));
            return wB.every(word => wA.includes(word));
        };

        const processedGroups = [];

        (groups || []).forEach(group => {
            let isAdviser = fuzzyMatch(group.adviser || group.advisor, currentUserNormalized);

            let groupDefenses = {};
            let hasValidPanel = false;

            (group.schedules || []).forEach(sched => {
                const panels = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5].filter(p => p);
                const isPanel = panels.some(p => fuzzyMatch(p, currentUserNormalized));

                let dTypeRaw = sched.schedule_type || 'Defense';
                let dType = dTypeRaw.toLowerCase().endsWith(' defense') ? dTypeRaw.substring(0, dTypeRaw.length - 8).trim() : dTypeRaw.trim();

                let normType = '';
                if (dType.toLowerCase().includes('title')) normType = 'titledefense';
                else if (dType.toLowerCase().includes('pre')) normType = 'preoraldefense';
                else if (dType.toLowerCase().includes('final')) normType = 'finaldefense';

                if (isPanel && normType) {
                    hasValidPanel = true;
                    // Check submitted scores
                    let submittedInd = (indScores || []).filter(s => s.schedule_id === sched.id);
                    let submittedSys = (sysScores || []).find(s => s.schedule_id === sched.id);
                    groupDefenses[normType] = {
                        id: sched.id,
                        defenseType: dType,
                        panelists: panels,
                        isSubmitted: submittedInd.length > 0 || !!submittedSys,
                        savedScores: {
                            individual: submittedInd,
                            system: submittedSys || null
                        }
                    };
                }
            });

            if (hasValidPanel) {
                processedGroups.push({
                    id: group.id,
                    groupId: group.id,
                    groupName: group.group_name,
                    members: group.students || [],
                    title: group.title,
                    program: group.program,
                    adviser: group.adviser,
                    defenses: groupDefenses
                });
            }
        });

        if (processedGroups.length === 0) {
            accordionContainer.innerHTML = '<div class="empty-state"><span class="material-icons-round">assignment_turned_in</span><p>No evaluations found for you.</p></div>';
            return;
        }

        loadedEvaluations = processedGroups;
        renderAccordions(processedGroups);

    } catch (err) {
        console.error('Error loading data:', err);
        accordionContainer.innerHTML = '<p style="text-align: center; color: red;">Error loading evaluations.</p>';
    }
}

function parseMembers(members) {
    if (!members) return [];
    if (Array.isArray(members)) return members;
    return members.split(',').map(m => m.trim());
}

window.applyStatusFilter = (status) => {
    currentStatusFilter = status;
    currentPage = 1;

    // Update button styles
    document.getElementById('btnPending').classList.toggle('active', status === 'pending');
    document.getElementById('btnDone').classList.toggle('active', status === 'done');

    renderAccordions(loadedEvaluations);
};


function renderAccordions(evaluations) {
    const container = document.getElementById('accordionContainer');
    container.innerHTML = '';

    // Filter local data based on current tab
    const filtered = evaluations.filter(ev => {
        const hasPending = Object.values(ev.defenses).some(d => !d.isSubmitted);
        const hasDone = Object.values(ev.defenses).some(d => d.isSubmitted);

        if (currentStatusFilter === 'pending') return hasPending;
        if (currentStatusFilter === 'done') return hasDone;
        return true;
    });

    if (filtered.length === 0) {
        const msg = currentStatusFilter === 'pending'
            ? "You have completed all your assigned evaluations!"
            : "You haven't submitted any evaluations yet.";
        const icon = currentStatusFilter === 'pending' ? 'task_alt' : 'history';

        container.innerHTML = `
            <div class="empty-state" style="padding: 60px 20px;">
                <span class="material-icons-round" style="font-size: 48px; color: #e5e7eb;">${icon}</span>
                <p style="margin-top: 10px; color: #9ca3af;">${msg}</p>
            </div>
        `;
        updatePaginationUI(0);
        return;
    }

    const totalPages = Math.ceil(filtered.length / rowsPerPage);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedItems = filtered.slice(startIndex, startIndex + rowsPerPage);

    paginatedItems.forEach(group => {
        const card = document.createElement('div');
        card.className = 'evaluation-card';
        card.style.background = 'white';
        card.style.borderRadius = '16px';
        card.style.boxShadow = '0 4px 15px rgba(0,0,0,0.05)';
        card.style.border = '1px solid #f0f0f0';
        card.style.overflow = 'hidden';
        card.style.marginBottom = '15px';

        let titleStr = '';
        if (typeof group.title === 'object' && group.title !== null) {
            titleStr = group.title.title1 || group.title.title2 || Object.values(group.title)[0] || '';
        } else if (typeof group.title === 'string' && group.title.startsWith('{')) {
            try { const t = JSON.parse(group.title); titleStr = t.title1 || Object.values(t)[0] || ''; } catch (e) { }
        } else if (group.title) {
            titleStr = group.title;
        }

        const program = (group.program || '').toUpperCase();
        let progColor = '#64748b'; let progBg = '#f1f5f9';
        if (program.includes('BSIS')) { progColor = '#0284c7'; progBg = '#e0f2fe'; }
        else if (program.includes('BSIT')) { progColor = '#16a34a'; progBg = '#dcfce7'; }
        else if (program.includes('BSCS')) { progColor = '#dc2626'; progBg = '#fee2e2'; }

        let adviserClean = group.adviser ? group.adviser.replace(/\s*\(creator:[^)]+\)/gi, '') : 'None Array';

        // Check if we show tab buttons according to the current filter
        const tabsRender = [];
        ['titledefense', 'preoraldefense', 'finaldefense'].forEach(dKey => {
            if (group.defenses[dKey]) {
                const def = group.defenses[dKey];
                let display = false;
                if (currentStatusFilter === 'pending' && !def.isSubmitted) display = true;
                if (currentStatusFilter === 'done' && def.isSubmitted) display = true;
                if (display) {
                    const label = dKey === 'titledefense' ? 'Title Defense' : dKey === 'preoraldefense' ? 'Pre-Oral Defense' : 'Final Defense';
                    tabsRender.push(`
                        <button class="inner-tab" data-tab="${dKey}" onclick="switchEvalInnerTab('${group.id}', '${dKey}', event)" 
                                style="padding: 12px 20px; font-size: 13px; font-weight: 600; color: #64748b; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s;">
                            ${label}
                        </button>
                    `);
                }
            }
        });

        card.innerHTML = `
             <div class="card-header" onclick="toggleAccordion('${group.id}')" style="cursor: pointer; padding: 20px; display: flex; justify-content: space-between; align-items: center; background: white; transition: background 0.2s;">
                 <div style="flex: 1; display: grid; grid-template-columns: 2fr 1fr 2fr; gap: 20px; align-items: center;">
                    <div>
                        <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Group Name</span>
                        <span style="font-size: 1.1rem; font-weight: 700; color: #1e293b;">${group.groupName}</span>
                    </div>
                    <div>
                        <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Program</span>
                        <span style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; color: ${progColor}; background: ${progBg};">${program}</span>
                    </div>
                    <div>
                        <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Project Title</span>
                        <div style="display: flex; align-items: center; gap: 6px; color: #475569; font-size: 13px; font-weight: 500;">
                            ${titleStr || 'Untitled'}
                        </div>
                    </div>
                 </div>
                 <span class="material-icons-round expand-icon" id="icon-${group.id}" style="color: #cbd5e1; transition: transform 0.3s; font-size: 24px; margin-left: 15px;">expand_more</span>
             </div>
             <div class="card-body" id="body-${group.id}" style="display: none; border-top: 1px solid #f1f5f9;">
                 <div style="display: flex; gap: 0; background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 0 15px; margin-top: 5px;">
                    ${tabsRender.join('')}
                 </div>
                 <div class="card-content" style="padding: 20px;">
                     ${getCardContentGrouped(group)}
                 </div>
             </div>
         `;
        container.appendChild(card);

        // Find the first tab that should be active and switch to it
        const firstActiveMatch = ['titledefense', 'preoraldefense', 'finaldefense'].find(dKey => {
            const def = group.defenses[dKey];
            if (!def) return false;
            if (currentStatusFilter === 'pending') return !def.isSubmitted;
            if (currentStatusFilter === 'done') return def.isSubmitted;
            return false;
        });

        if (firstActiveMatch) {
            setTimeout(() => switchEvalInnerTab(group.id, firstActiveMatch, null), 10);
        }
    });

    updatePaginationUI(totalPages);
}

// Inner tab switcher
let activeInnerTabs = {};
window.switchEvalInnerTab = (groupId, tabKey, event) => {
    if (event) event.stopPropagation();
    activeInnerTabs[groupId] = tabKey;

    const cardBody = document.getElementById(`body-${groupId}`);
    if (!cardBody) return;

    const tabs = cardBody.querySelectorAll('.inner-tab');
    tabs.forEach(tab => {
        if (tab.dataset.tab === tabKey) {
            tab.classList.add('active');
            tab.style.borderBottom = '2px solid var(--primary-color)';
            tab.style.color = 'var(--primary-color)';
        } else {
            tab.classList.remove('active');
            tab.style.borderBottom = 'none';
            tab.style.color = '#64748b';
        }
    });

    const contents = cardBody.querySelectorAll('.inner-tab-content');
    contents.forEach(content => {
        if (content.dataset.content === tabKey) {
            content.style.display = 'block';
        } else {
            content.style.display = 'none';
        }
    });
};

function getCardContentGrouped(group) {
    const renderDefense = (dKey) => {
        const defense = group.defenses[dKey];
        if (!defense || (currentStatusFilter === 'pending' && defense.isSubmitted) || (currentStatusFilter === 'done' && !defense.isSubmitted)) {
            return '';
        }

        const isMultiPage = dKey.includes('pre') || dKey.includes('final');
        let html = '';

        if (isMultiPage) {
            html += `
                <div class="switcher-tabs">
                    <button class="switcher-btn active" id="btn-p1-${defense.id}" onclick="switchPage('${defense.id}', 1)">
                        <span class="material-icons-round">person</span> Individual
                    </button>
                    <button class="switcher-btn" id="btn-p2-${defense.id}" onclick="switchPage('${defense.id}', 2)">
                        <span class="material-icons-round">dvr</span> System Project
                    </button>
                </div>
            `;
        }

        // We wrap evaluation items in an object similar to old evalItem for compatibility with renderIndividualTable / renderSystemTable
        const evalItem = {
            id: defense.id,
            groupId: group.id,
            members: group.members,
            isSubmitted: defense.isSubmitted,
            savedScores: defense.savedScores,
            defenseType: defense.defenseType
        };

        html += `<div class="eval-step active" id="step1-${defense.id}">`;

        html += `
            <div class="info-grid">
                <div class="info-section">
                    <h5><span class="material-icons-round" style="color: var(--primary-color); font-size: 20px;">groups</span> Students</h5>
                    <ul class="info-list">
                        ${evalItem.members && evalItem.members.length > 0
                ? evalItem.members.map((m, i) => `<li><span class="index">${i + 1}.</span> ${m.full_name}</li>`).join('')
                : '<li style="color: #9ca3af; font-style: italic;">No students assigned</li>'}
                    </ul>
                </div>
            </div>
        `;

        if (evalItem.members && evalItem.members.length > 0) {
            html += renderIndividualTable(evalItem);
        } else {
            html += '<p style="color: #666; font-style: italic; padding: 20px;">Please ensure students are added to this group to enable individual scoring.</p>';
        }

        if (isMultiPage) {
            html += `
                <div style="margin-top: 25px; text-align: right; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                    <button class="btn-save" onclick="switchPage('${defense.id}', 2)" 
                            style="padding: 12px 24px; border-radius: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 10px; transition: all 0.3s; box-shadow: 0 4px 12px rgba(26, 86, 219, 0.2);">
                        Next: System Evaluation 
                        <span class="material-icons-round" style="font-size: 20px;">arrow_forward</span>
                    </button>
                </div>
            `;
        }

        html += `</div>`; // Close step 1

        if (isMultiPage) {
            html += `<div class="eval-step" id="step2-${defense.id}">`;
            html += renderSystemTable(evalItem);
            html += `
                <div style="margin-top: 30px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 25px;">
                    <button class="btn-cancel" onclick="switchPage('${defense.id}', 1)" 
                            style="padding: 12px 24px; border-radius: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; border: 1.5px solid #e2e8f0; background: white; color: #64748b;">
                        <span class="material-icons-round" style="font-size: 20px;">arrow_back</span>
                        Back
                    </button>
            `;
            if (!evalItem.isSubmitted) {
                html += `
                    <button class="btn-save" onclick="submitEvaluation(${defense.id})" 
                            style="padding: 12px 35px; border-radius: 12px; font-weight: 700; box-shadow: 0 4px 15px rgba(26, 86, 219, 0.3);">
                        Submit Evaluation
                    </button>`;
            }
            html += `</div></div>`;
        } else if (!evalItem.isSubmitted) {
            // Simple Submit for non-multipage
            html += `
                <div style="margin-top: 30px; text-align: right; border-top: 1px solid #eee; padding-top: 20px;">
                    <button class="btn-save" onclick="submitEvaluation(${defense.id})" 
                            style="padding: 12px 35px; border-radius: 12px; font-weight: 700; box-shadow: 0 4px 12px rgba(26, 86, 219, 0.2);">
                        Submit Evaluation
                    </button>
                </div>
            `;
        }

        return html;
    };

    return `
        <div class="inner-tab-content active" data-content="titledefense">${renderDefense('titledefense')}</div>
        <div class="inner-tab-content" data-content="preoraldefense" style="display:none;">${renderDefense('preoraldefense')}</div>
        <div class="inner-tab-content" data-content="finaldefense" style="display:none;">${renderDefense('finaldefense')}</div>
    `;
}
function updatePaginationUI(totalPages) {
    let paginationContainer = document.getElementById('evaluationPagination');
    if (!paginationContainer) {
        const container = document.getElementById('accordionContainer');
        if (container) {
            paginationContainer = document.createElement('div');
            paginationContainer.id = 'evaluationPagination';
            paginationContainer.className = 'pagination';
            paginationContainer.style.justifyContent = 'flex-end';
            container.after(paginationContainer);
        } else {
            return;
        }
    }

    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }

    paginationContainer.style.display = 'flex';

    paginationContainer.innerHTML = `
        <button class="page-btn prev" ${currentPage === 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : `onclick="changePage(${currentPage - 1})"`}>Previous</button>
        <span class="page-number active">${currentPage}</span>
        <button class="page-btn next" ${currentPage === totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : `onclick="changePage(${currentPage + 1})"`}>Next</button>
    `;
}

window.changePage = (newPage) => {
    currentPage = newPage;
    renderAccordions(loadedEvaluations);
};

function renderIndividualTable(evalItem) {
    const isSaved = evalItem.isSubmitted;
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

            if (isSaved) {
                inputs += `<td style="font-weight: 600; color: #374151;">${scoreVal || '-'}</td>`;
            } else {
                inputs += `
                    <td>
                        <select class="score-input p-score-${evalItem.id}-${mIdx}" 
                                onchange="calcIndividualTotal(${evalItem.id}, ${mIdx})">
                            <option value="0">--</option>
                            <option value="4">4</option>
                            <option value="3">3</option>
                            <option value="2">2</option>
                            <option value="1">1</option>
                        </select>
                    </td>
                `;
            }
        });
        rows += `
            <tr>
                <td class="criteria-cell" style="text-align: left; background: #fafafa;">
                    <div style="font-weight: 600; display: flex; align-items: center; gap: 8px;">
                         <span style="flex: 1;">${c.name}</span>
                         <span class="material-icons-round tooltip-trigger" 
                               style="font-size: 18px; color: #cbd5e1; cursor: help;"
                               onmouseover="if(window.innerWidth > 768) showRubricTip(event, '${c.name}');" 
                               onmouseout="if(window.innerWidth > 768) hideRubricTip();"
                               onclick="if(window.innerWidth <= 768) showRubricTip(event, '${c.name}');">
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
        if (isSaved) {
            const saved = evalItem.savedScores.individual.find(s => s.student_id === student.id);
            total = saved ? saved.total_score : 0;
        }
        totalCells += `<td id="total-${evalItem.id}-${mIdx}" style="font-weight: 800; font-size: 1.1rem; color: var(--primary-color);">${total}</td>`;
    });

    return `
        <div style="margin-bottom: 25px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                <span class="material-icons-round" style="color: var(--primary-color);">person_outline</span>
                <h4 style="color: var(--text-main); font-size: 1.05rem; font-weight: 700;">Individual Rating of Presenters</h4>
            </div>
            ${!isSaved ? '<p style="font-size: 0.75rem; color: #6b7280; font-style: italic;">Hover over the icon next to criteria for detailed rubric guidance.</p>' : ''}
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
    const isSaved = evalItem.isSubmitted && evalItem.savedScores.system;
    const sysCols = ['func_score', 'tech_score', 'usability_score', 'code_score', 'innov_score', 'testing_score', 'docu_score', 'demo_score'];

    let rows = '';
    systemCriteria.forEach((c, cIdx) => {
        let inputArea = '';
        if (isSaved) {
            const scoreVal = evalItem.savedScores.system[sysCols[cIdx]];
            inputArea = `<div style="font-weight: 800; color: var(--primary-color); text-align: center; font-size: 1.1rem;">${scoreVal || '-'}</div>`;
        } else {
            inputArea = `
                <select class="score-input sys-score-${evalItem.id}" 
                        onchange="calcSystemTotal(${evalItem.id})"
                        style="width: 100%; border-color: var(--primary-color); font-weight: 700;">
                    <option value="0">--</option>
                    <option value="4">4</option>
                    <option value="3">3</option>
                    <option value="2">2</option>
                    <option value="1">1</option>
                </select>
            `;
        }

        rows += `
            <tr>
                <td class="criteria-cell" style="text-align: left; background: #fafafa;">
                    <div style="font-weight: 600; display: flex; align-items: center; gap: 8px;">
                         <span style="flex: 1;">${c.name}</span>
                         <span class="material-icons-round tooltip-trigger" 
                               style="font-size: 18px; color: #cbd5e1; cursor: help;"
                               onmouseover="if(window.innerWidth > 768) showRubricTip(event, '${c.name}', true);" 
                               onmouseout="if(window.innerWidth > 768) hideRubricTip();"
                               onclick="if(window.innerWidth <= 768) showRubricTip(event, '${c.name}', true);">
                               help_outline
                         </span>
                    </div>
                </td>
                <td>${inputArea}</td>
            </tr>
        `;
    });

    const totalVal = isSaved ? evalItem.savedScores.system.total_score : 0;

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
                        <td id="sys-total-${evalItem.id}" style="font-weight: 900; font-size: 1.25rem; color: var(--primary-color); text-align: center;">${totalVal}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

/* replaced */ window.switchPageLegacy = (id, page) => {
    const step1 = document.getElementById(`step1-${id}`);
    const step2 = document.getElementById(`step2-${id}`);
    const btn1 = document.getElementById(`btn-p1-${id}`);
    const btn2 = document.getElementById(`btn-p2-${id}`);

    if (page === 1) {
        step1.classList.add('active');
        step2.classList.remove('active');
        btn1.classList.add('active');
        btn2.classList.remove('active');
    } else {
        step1.classList.remove('active');
        step2.classList.add('active');
        btn1.classList.remove('active');
        btn2.classList.add('active');
    }
};

// --- Interaction Helpers ---
/* replaced */ window.toggleAccordionLegacy = (id) => {
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

window.calcIndividualTotal = (schedId, memberIdx) => {
    const inputs = document.querySelectorAll(`.p-score-${schedId}-${memberIdx}`);
    let sum = 0;
    inputs.forEach(input => sum += parseInt(input.value));
    const totalEl = document.getElementById(`total-${schedId}-${memberIdx}`);
    if (totalEl) totalEl.textContent = sum;
};

window.calcSystemTotal = (schedId) => {
    const inputs = document.querySelectorAll(`.sys-score-${schedId}`);
    let sum = 0;
    inputs.forEach(input => sum += parseInt(input.value));
    const totalEl = document.getElementById(`sys-total-${schedId}`);
    if (totalEl) totalEl.textContent = sum;
};

window.submitEvaluation = async (schedId) => {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    const evalItem = loadedEvaluations.find(ev => ev.id === schedId);
    if (!evalItem || !loginUser) return;

    const btn = event.target;
    // Store original text to restore later if needed
    const originalText = btn.innerText;

    // --- Validation Start ---
    let hasError = false;

    // 1. Validate Individual Scores
    // We can check the DOM directly for any score of "0"
    const allIndividualSelects = document.querySelectorAll(`[class*="p-score-${schedId}"]`);
    for (let select of allIndividualSelects) {
        if (select.value === "0" || select.value === "") {
            hasError = true;
            // Optional: Highlight the missing field
            select.style.border = "1px solid red";
        } else {
            select.style.border = "";
        }
    }

    if (hasError) {
        showErrorAlert("Please grade ALL individual criteria for ALL students before submitting.");
        return;
    }

    // 2. Validate System Scores (if present)
    const allSystemSelects = document.querySelectorAll(`.sys-score-${schedId}`);
    if (allSystemSelects.length > 0) {
        for (let select of allSystemSelects) {
            if (select.value === "0" || select.value === "") {
                hasError = true;
                select.style.border = "1px solid red";
            } else {
                select.style.border = "";
            }
        }

        if (hasError) {
            showErrorAlert("Please score ALL system criteria before submitting.");
            return;
        }
    }
    // --- Validation End ---

    try {
        btn.disabled = true;
        btn.innerText = 'Saving...';

        // 1. Prepare Individual Evaluations
        const individualRecords = [];
        evalItem.members.forEach((student, mIdx) => {
            const scores = {};
            let studentTotal = 0;

            individualCriteria.forEach(c => {
                const select = document.querySelector(`.p-score-${schedId}-${mIdx}`);
                // Although we validated above, we re-parse safely here
                const score = select ? parseInt(select.value) : 0;
                const slug = c.name.toLowerCase().split(' ')[0] + '_score';
                scores[slug] = score;
                studentTotal += score;
            });

            individualRecords.push({
                schedule_id: schedId,
                student_id: student.id,
                panelist_name: loginUser.name,
                // Explicitly mapping collected scores
                ...collectIndividualScores(schedId, mIdx),
                total_score: studentTotal
            });
        });

        // 2. Prepare System Evaluation (if applicable)
        const systemRecord = collectSystemScores(schedId, evalItem.groupId, loginUser.name);

        // 3. Save to Supabase
        // Batch insert individual scores
        const { error: indError } = await supabaseClient
            .from('individual_evaluations')
            .insert(individualRecords);

        if (indError) throw indError;

        // Save system scores (if any)
        if (systemRecord) {
            const { error: sysError } = await supabaseClient
                .from('system_evaluations')
                .insert(systemRecord);
            if (sysError) throw sysError;
        }

        // Auto-refresh to show the persistent read-only table
        await loadEvaluations();

    } catch (err) {
        console.error('Submission Error:', err);
        showErrorAlert('Failed to save evaluation. Please check your connection.');
        btn.disabled = false;
        btn.innerText = originalText;
    }
};

// --- Custom Alert Logic ---
window.showErrorAlert = (msg) => {
    const alertBox = document.getElementById('customAlert');
    if (alertBox) {
        document.getElementById('customAlertMsg').innerText = msg;
        alertBox.style.display = 'flex';
    } else {
        alert(msg); // Fallback
    }
};

window.closeCustomAlert = () => {
    const alertBox = document.getElementById('customAlert');
    if (alertBox) alertBox.style.display = 'none';
};

function collectIndividualScores(schedId, mIdx) {
    const selects = document.querySelectorAll(`[class*="p-score-${schedId}-${mIdx}"]`);
    const data = {};
    const columns = ['clarity_score', 'engagement_score', 'delivery_score', 'knowledge_score', 'collab_score', 'prof_score', 'time_score'];

    selects.forEach((sel, i) => {
        if (columns[i]) data[columns[i]] = parseInt(sel.value || 0);
    });
    return data;
}

function collectSystemScores(schedId, groupId, panelName) {
    const selects = document.querySelectorAll(`.sys-score-${schedId}`);
    if (selects.length === 0) return null;

    const data = {
        schedule_id: schedId,
        group_id: groupId,
        panelist_name: panelName
    };

    const columns = ['func_score', 'tech_score', 'usability_score', 'code_score', 'innov_score', 'testing_score', 'docu_score', 'demo_score'];
    let total = 0;

    selects.forEach((sel, i) => {
        const val = parseInt(sel.value || 0);
        if (columns[i]) data[columns[i]] = val;
        total += val;
    });

    data.total_score = total;
    return data;
}

// --- Custom Rubric Tooltip Logic ---
function initTooltip() {
    if (!document.getElementById('rubricTooltip')) {
        const tip = document.createElement('div');
        tip.id = 'rubricTooltip';
        tip.style.cssText = `
            position: fixed;
            background: rgba(15, 23, 42, 0.98);
            color: white;
            padding: 16px 20px;
            border-radius: 12px;
            font-size: 13px;
            max-width: 90vw;
            width: 380px;
            z-index: 100000;
            display: none;
            box-shadow: 0 10px 40px rgba(0,0,0,0.4);
            line-height: 1.5;
            transition: opacity 0.2s, transform 0.2s;
            border-left: 5px solid #ffcc00;
            max-height: 80vh;
            overflow-y: auto;
        `;
        document.body.appendChild(tip);

        // Add overlay for mobile
        const overlay = document.createElement('div');
        overlay.id = 'rubricOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 99999;
            display: none;
            backdrop-filter: blur(2px);
        `;
        overlay.onclick = hideRubricTip;
        document.body.appendChild(overlay);
    }
}

window.showRubricTip = (event, criteriaName, isSystem = false) => {
    initTooltip();
    const criteria = isSystem
        ? systemCriteria.find(c => c.name === criteriaName)
        : individualCriteria.find(c => c.name === criteriaName);

    if (!criteria) return;

    const tip = document.getElementById('rubricTooltip');
    const overlay = document.getElementById('rubricOverlay');
    const isMobile = window.innerWidth <= 768;

    tip.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
            <div style="font-weight: 700; color: #ffcc00; font-size: 14px;">
                ${criteriaName} Rubric
            </div>
            ${isMobile ? '<span class="material-icons-round" onclick="hideRubricTip()" style="cursor:pointer; font-size: 18px; color: #94a3b8;">close</span>' : ''}
        </div>
        <div style="display: grid; gap: 12px;">
            <div style="font-size: 12px; background: rgba(74, 222, 128, 0.1); padding: 8px; border-radius: 6px;"><strong style="color: #4ade80;">4 - Excellent:</strong><br> <span style="opacity: 0.95;">${criteria.rubrics[4]}</span></div>
            <div style="font-size: 12px; background: rgba(251, 191, 36, 0.1); padding: 8px; border-radius: 6px;"><strong style="color: #fbbf24;">3 - Good:</strong><br> <span style="opacity: 0.95;">${criteria.rubrics[3]}</span></div>
            <div style="font-size: 12px; background: rgba(248, 113, 113, 0.1); padding: 8px; border-radius: 6px;"><strong style="color: #f87171;">2 - Fair:</strong><br> <span style="opacity: 0.95;">${criteria.rubrics[2]}</span></div>
            <div style="font-size: 12px; background: rgba(239, 68, 68, 0.1); padding: 8px; border-radius: 6px;"><strong style="color: #ef4444;">1 - Needs Improvement:</strong><br> <span style="opacity: 0.95;">${criteria.rubrics[1]}</span></div>
        </div>
    `;

    tip.style.display = 'block';

    if (isMobile) {
        overlay.style.display = 'block';
        tip.style.left = '50%';
        tip.style.top = '50%';
        tip.style.transform = 'translate(-50%, -50%)';
        tip.style.width = '90vw';
        tip.style.pointerEvents = 'auto';
    } else {
        tip.style.pointerEvents = 'none';
        tip.style.transform = 'none';
        tip.style.width = '380px';
        const rect = event.currentTarget.getBoundingClientRect();
        const tipWidth = 380;

        let x = rect.right + 20;
        let y = event.clientY - 50;

        if (x + tipWidth > window.innerWidth) {
            x = rect.left - tipWidth - 20;
        }

        const tipHeight = tip.offsetHeight || 300;
        if (y + tipHeight > window.innerHeight) {
            y = window.innerHeight - tipHeight - 20;
        }
        if (y < 20) y = 20;

        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
    }
};

window.hideRubricTip = () => {
    const tip = document.getElementById('rubricTooltip');
    const overlay = document.getElementById('rubricOverlay');
    if (tip) tip.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
};

// Initial tooltips setup
document.addEventListener('DOMContentLoaded', initTooltip);


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
        if (step1) step1.classList.add('active');
        if (step2) step2.classList.remove('active');
        if (btn1) btn1.classList.add('active');
        if (btn2) btn2.classList.remove('active');
    } else {
        if (step1) step1.classList.remove('active');
        if (step2) step2.classList.add('active');
        if (btn1) btn1.classList.remove('active');
        if (btn2) btn2.classList.add('active');
    }
};
