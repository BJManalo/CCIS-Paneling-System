// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Global State
let allData = [];
let loadedEvaluations = [];
let currentStatusFilter = 'pending'; // Default view: To Be Evaluated

document.addEventListener('DOMContentLoaded', () => {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    const userRole = (loginUser && loginUser.role) ? loginUser.role.trim().toLowerCase() : '';

    if (userRole === 'adviser') {
        document.querySelectorAll('a[href*="panel_evaluation"]').forEach(nav => {
            nav.style.setProperty('display', 'none', 'important');
        });
        window.location.href = 'panel_capstone';
        return;
    }

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

    try {
        // 1. Fetch Groups + their Schedules + Students (Core Data)
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

        // 2. Process Data & Check Roles
        const currentUser = (loginUser.name || "").trim().toLowerCase();
        const evaluations = (groups || []).flatMap(group => {
            const adviserName = (group.adviser || group.advisor || "").trim().toLowerCase();
            const isAdviser = adviserName === currentUser;
            const schedules = group.schedules || [];
            const results = [];

            schedules.forEach(sched => {
                const panels = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5]
                    .filter(p => p).map(p => p.trim().toLowerCase());

                const isPanel = panels.includes(currentUser);
                let dType = sched.schedule_type || 'Defense';
                if (dType.toLowerCase().endsWith(' defense')) {
                    dType = dType.substring(0, dType.length - 8).trim();
                }

                if (isPanel) {
                    results.push({
                        id: sched.id,
                        groupId: group.id,
                        groupName: group.group_name,
                        members: group.students || [],
                        title: group.title,
                        defenseType: dType,
                        panelists: [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5].filter(p => p),
                        roles: { panel: isPanel, adviser: isAdviser }
                    });
                }
            });
            return results;
        });

        // 3. Fetch already submitted scores for this user
        const { data: indScores } = await supabaseClient
            .from('individual_evaluations')
            .select('*')
            .eq('panelist_name', loginUser.name);

        const { data: sysScores } = await supabaseClient
            .from('system_evaluations')
            .select('*')
            .eq('panelist_name', loginUser.name);

        // 4. Attach scores to evaluations
        evaluations.forEach(ev => {
            ev.savedScores = {
                individual: (indScores || []).filter(s => s.schedule_id === ev.id),
                system: (sysScores || []).find(s => s.schedule_id === ev.id)
            };
            ev.isSubmitted = ev.savedScores.individual.length > 0 || !!ev.savedScores.system;
        });

        if (evaluations.length === 0) {
            accordionContainer.innerHTML = '<div class="empty-state"><span class="material-icons-round">assignment_turned_in</span><p>No evaluations found for you.</p></div>';
            return;
        }

        loadedEvaluations = evaluations;
        renderAccordions(evaluations);

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
        if (currentStatusFilter === 'pending') return !ev.isSubmitted;
        if (currentStatusFilter === 'done') return ev.isSubmitted;
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
        return;
    }

    filtered.forEach(evalItem => {
        const card = document.createElement('div');
        card.className = 'evaluation-card';

        const dBadgeClass = evalItem.defenseType.toLowerCase().includes('title') ? 'title-defense' :
            (evalItem.defenseType.toLowerCase().includes('pre-oral') || evalItem.defenseType.toLowerCase().includes('pre oral')) ? 'pre-oral' :
                evalItem.defenseType.toLowerCase().includes('final') ? 'final-defense' : 'title-defense';

        card.innerHTML = `
             <div class="card-header" onclick="toggleAccordion(${evalItem.id})">
                 <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div class="header-info">
                        <span class="group-name">${evalItem.groupName}</span>
                        ${evalItem.title ? `<div style="font-size: 0.85rem; color: #6b7280; margin-top: 4px; line-height: 1.4;">${evalItem.title}</div>` : ''}
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

    // Switcher Tabs for Multi-page
    if (isMultiPage) {
        html += `
            <div class="switcher-tabs">
                <button class="switcher-btn active" id="btn-p1-${evalItem.id}" onclick="switchPage(${evalItem.id}, 1)">
                    <span class="material-icons-round">person</span> Individual
                </button>
                <button class="switcher-btn" id="btn-p2-${evalItem.id}" onclick="switchPage(${evalItem.id}, 2)">
                    <span class="material-icons-round">dvr</span> System Project
                </button>
            </div>
        `;
    }

    // Step 1: Individual Rating
    html += `<div class="eval-step active" id="step1-${evalItem.id}">`;
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
            <div class="info-shared" style="display: none;"></div> 
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
                <button class="btn-save" onclick="switchPage(${evalItem.id}, 2)" 
                        style="padding: 12px 24px; border-radius: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 10px; transition: all 0.3s; box-shadow: 0 4px 12px rgba(26, 86, 219, 0.2);">
                    Next: System Evaluation 
                    <span class="material-icons-round" style="font-size: 20px;">arrow_forward</span>
                </button>
            </div>
        `;
    }
    html += `</div>`; // Close step 1

    // Step 2: System Rating
    if (isMultiPage) {
        html += `<div class="eval-step" id="step2-${evalItem.id}">`;
        html += renderSystemTable(evalItem);
        html += `
            <div style="margin-top: 30px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 25px;">
                <button class="btn-cancel" onclick="switchPage(${evalItem.id}, 1)" 
                        style="padding: 12px 24px; border-radius: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; border: 1.5px solid #e2e8f0; background: white; color: #64748b;">
                    <span class="material-icons-round" style="font-size: 20px;">arrow_back</span>
                    Back
                </button>
        `;

        if (!evalItem.isSubmitted) {
            html += `
                <button class="btn-save" onclick="submitEvaluation(${evalItem.id})" 
                        style="padding: 12px 35px; border-radius: 12px; font-weight: 700; font-size: 1.05rem; box-shadow: 0 4px 15px rgba(26, 86, 219, 0.3);">
                    Submit Evaluation
                </button>`;
        }
        html += `</div></div>`;
    } else if (!evalItem.isSubmitted) {
        // Simple Submit for non-multipage
        html += `
            <div style="margin-top: 30px; text-align: right; border-top: 1px solid #eee; padding-top: 20px;">
                <button class="btn-save" onclick="submitEvaluation(${evalItem.id})" 
                        style="padding: 12px 35px; border-radius: 12px; font-weight: 700; box-shadow: 0 4px 12px rgba(26, 86, 219, 0.2);">
                    Submit Evaluation
                </button>
            </div>
        `;
    }

    return html;
}

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
                               onmouseover="showRubricTip(event, '${c.name}', true);" 
                               onmouseout="hideRubricTip();">
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

window.switchPage = (id, page) => {
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

// Initial tooltips setup
document.addEventListener('DOMContentLoaded', initTooltip);

