// Initialize Supabase client
// Note: PROJECT_URL, PUBLIC_KEY, and supabaseClient are already defined in ../../assets/js/shared.js
// We use the existing client to avoid "Identifier already declared" errors.

document.addEventListener('DOMContentLoaded', () => {
    loadSubmissionData();
});

async function loadSubmissionData() {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));

    if (!loginUser) {
        window.location.href = '../../';
        return;
    }

    let groupId = loginUser.id;

    // Global variable linking
    if (!window.currentLinks) window.currentLinks = {};

    try {
        const { data: group, error } = await supabaseClient
            .from('student_groups')
            .select('*, students(id, grades(grade, grade_type))') // Fetch students & grades
            .eq('id', groupId)
            .single();

        if (error) {
            console.error('Error fetching group:', error);
            if (loginUser.role) {
                alert("You are logged in as " + loginUser.role + ". This page is for Student Groups.");
            }
            return;
        }

        if (group) {
            // --- Fetch Schedules to check if they are allowed to submit ---
            const { data: schedules, error: schedError } = await supabaseClient
                .from('schedules')
                .select('*')
                .eq('group_id', groupId);

            if (schedError) console.error('Error fetching schedules:', schedError);

            const normalize = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
            const isScheduled = (type) => {
                if (!schedules) return false;
                return schedules.some(s => normalize(s.schedule_type).includes(normalize(type)));
            };

            const isTitleScheduled = isScheduled('Title');
            const isPreOralScheduled = isScheduled('PreOral'); // checks 'preoral'
            const isFinalScheduled = isScheduled('Final');

            // --- Check Grading Status for Tab Locking ---
            const students = group.students || [];
            const totalStudents = students.length;

            // Helper to check if ALL students have a grade for a specific stage
            const checkGraded = (keyword) => {
                if (totalStudents === 0) return false;
                const gradedCount = students.filter(s =>
                    s.grades && s.grades.some(g => g.grade_type && g.grade_type.includes(keyword))
                ).length;
                return gradedCount === totalStudents;
            };

            const isTitleGraded = checkGraded('Title');
            const isPreOralGraded = checkGraded('Pre'); // Matches "Pre-Oral" or "Pre Oral"

            // Lock/Unlock Tabs
            const titleBtn = document.querySelector('button[onclick*="titles"]');
            const preOralBtn = document.querySelector('button[onclick*="preoral"]');
            const finalBtn = document.querySelector('button[onclick*="final"]');

            // Global State for Schedule status (to use in updateSaveButtonState)
            window.scheduleStatus = {
                title: isTitleScheduled,
                preoral: isPreOralScheduled,
                final: isFinalScheduled
            };

            // Logic: Title requires Schedule
            if (!isTitleScheduled) {
                // If not scheduled, they can VIEW if they somehow have data, but effectively they shouldn't have data if they followed flow.
                // We'll handled read-only in updateSaveButtonState, but visually we might want to indicate it.
                // OPTIONAL: We can lock the tab entirely if we want, but sticking to "Can't submit" usually means read-only or save disabled.
            }

            // Logic: Pre-Oral requires Title to be graded AND Pre-Oral Schedule
            if (!isTitleGraded) {
                preOralBtn.disabled = true;
                preOralBtn.style.opacity = '0.5';
                preOralBtn.style.cursor = 'not-allowed';
                preOralBtn.title = "Locked: Title Defense grades pending.";
                preOralBtn.innerHTML += ' <span class="material-icons-round" style="font-size:14px; vertical-align:middle;">lock</span>';
            } else if (!isPreOralScheduled) {
                // Unlock tab traversal but maybe warning? 
                // Using the requested logic "students can't submit" -> implies maybe they can enter but not save, OR they can't even enter.
                // Usually preventing entry is safest for specific strict phases.
                // However, user might want to see previous stuff? 
                // Let's rely on updateSaveButtonState to disable saving/editing, but allow tab click if previous stage passed.
            }

            // Logic: Final requires Pre-Oral to be graded AND Final Schedule
            if (!isPreOralGraded) {
                finalBtn.disabled = true;
                finalBtn.style.opacity = '0.5';
                preOralBtn.style.cursor = 'not-allowed'; // Typo fix in logic, but standardizing
                finalBtn.style.cursor = 'not-allowed';
                finalBtn.title = "Locked: Pre-Oral grades pending.";
                finalBtn.innerHTML += ' <span class="material-icons-round" style="font-size:14px; vertical-align:middle;">lock</span>';
            }

            // Function to safely parse JSON
            const safeParse = (str) => {
                try { return JSON.parse(str || '{}'); } catch (e) { return {}; }
            };

            // Parse File Links
            let tLinks = safeParse(group.title_link);
            if (group.title_link && typeof group.title_link === 'string' && !group.title_link.startsWith('{')) tLinks = { title1: group.title_link };

            // Load Project Title(s)
            let projectTitles = {};
            try {
                projectTitles = JSON.parse(group.project_title || '{}');
            } catch (e) {
                // Backward compatibility: if simple string
                projectTitles = { title1: group.project_title || '' };
            }

            // Populate inputs
            if (document.getElementById('projectTitle1')) document.getElementById('projectTitle1').value = projectTitles.title1 || '';
            if (document.getElementById('projectTitle2')) document.getElementById('projectTitle2').value = projectTitles.title2 || '';
            if (document.getElementById('projectTitle3')) document.getElementById('projectTitle3').value = projectTitles.title3 || '';

            let pLinks = safeParse(group.pre_oral_link);
            let fLinks = safeParse(group.final_link);

            // Fetch Defense Statuses from the new table
            const { data: defStatuses, error: dsError } = await supabaseClient
                .from('defense_statuses')
                .select('*')
                .eq('group_id', groupId);

            if (dsError) {
                console.error('Error fetching defense statuses:', dsError);
            }

            // Helper to get status/remarks for a specific type
            const getDS = (type) => {
                const norm = type.toLowerCase().replace(/[^a-z0-9]/g, '');
                return defStatuses ? defStatuses.find(ds => ds.defense_type.toLowerCase().replace(/[^a-z0-9]/g, '') === norm) : null;
            };

            const titleDS = getDS('Title Defense');
            const preOralDS = getDS('Pre-Oral Defense');
            const finalDS = getDS('Final Defense');

            // Map Statuses
            let tStatus = titleDS ? (titleDS.statuses || {}) : {};
            let pStatus = preOralDS ? (preOralDS.statuses || {}) : {};
            let fStatus = finalDS ? (finalDS.statuses || {}) : {};

            // Map Remarks
            let tRemarks = titleDS ? (titleDS.remarks || {}) : {};
            let pRemarks = preOralDS ? (preOralDS.remarks || {}) : {};
            let fRemarks = finalDS ? (finalDS.remarks || {}) : {};

            // Helper to render status badge, remarks, AND file link
            const renderField = (linkMap, statusMap, remarksMap, key, fileElementId, linkDisplayId) => {
                const fileEl = document.getElementById(fileElementId);
                const linkDisplayEl = document.getElementById(linkDisplayId);

                if (!fileEl) return;

                const currentLink = linkMap[key] || '';

                // Show existing link if available
                if (currentLink && linkDisplayEl) {
                    const fileName = currentLink.split('/').pop().split('?')[0].substring(0, 30) + '...';
                    linkDisplayEl.innerHTML = `
                        <a href="${currentLink}" target="_blank" style="text-decoration:none; color:var(--primary-color); display:flex; align-items:center; gap:5px; padding:4px 8px; background:#e0f2fe; border-radius:4px; border:1px solid #bae6fd; width:fit-content;">
                             <span class="material-icons-round" style="font-size:14px;">description</span>
                             <span style="font-weight:600;">View Submitted File</span>
                        </a>
                        <div style="font-size:10px; color:#94a3b8; margin-top:2px; margin-left:4px;">${fileName}</div>
                    `;
                }

                const rawStatus = statusMap[key] || 'Pending';
                const rawRemarks = remarksMap[key] || {};

                // --- Multi-Panel Logic ---
                let feedbackData = [];

                if (typeof rawStatus === 'object') {
                    Object.keys(rawStatus).forEach(panel => {
                        feedbackData.push({
                            panel: panel,
                            status: rawStatus[panel],
                            remarks: typeof rawRemarks === 'object' ? (rawRemarks[panel] || '') : ''
                        });
                    });
                } else {
                    feedbackData.push({
                        panel: 'Panel',
                        status: rawStatus,
                        remarks: typeof rawRemarks === 'string' ? rawRemarks : ''
                    });
                }

                // 1. Label & Badge Wrapper
                // Find label previous to input
                const label = fileEl.parentElement.querySelector('label');
                const existingBadge = fileEl.parentElement.querySelector('.status-badge-container');
                if (existingBadge) existingBadge.remove();

                const badgesHtml = feedbackData.map(f => {
                    let color = '#64748b'; let icon = 'hourglass_empty'; let bg = '#f1f5f9'; let border = '#e2e8f0';
                    if (f.status.includes('Approved')) {
                        color = '#059669'; icon = 'check_circle'; bg = '#f0fdf4'; border = '#bbf7d0';
                    } else if (f.status.includes('Approve with Revisions')) {
                        color = '#d97706'; icon = 'warning'; bg = '#fffbeb'; border = '#fde68a';
                    } else if (f.status.includes('Rejected') || f.status.includes('Redefense')) {
                        color = '#dc2626'; icon = 'cancel'; bg = '#fef2f2'; border = '#fecaca';
                    }

                    return `
                        <div style="font-size: 0.65rem; font-weight: 700; color: ${color}; background: ${bg}; border: 1px solid ${border}; padding: 2px 6px; border-radius: 6px; display: flex; align-items: center; gap: 4px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;" title="${f.panel}">
                            <span class="material-icons-round" style="font-size: 10px;">${icon}</span>
                            ${f.status} ${feedbackData.length > 1 ? `<span style="opacity:0.6; font-size:9px;">(${f.panel})</span>` : ''}
                        </div>
                    `;
                }).join('');

                if (label) {
                    const headerHtml = `
                        <div class="status-badge-container" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                             <span></span>
                            <div style="display: flex; flex-direction: column; align-items: flex-end;">
                                ${badgesHtml}
                            </div>
                        </div>
                    `;
                    // Insert badge inside label or right after?
                    // Let's insert before label to be safe or append to label
                    label.insertAdjacentHTML('beforeend', `<div style="float:right">${badgesHtml}</div>`);
                }

                // 2. Remarks
                const existingRemarks = fileEl.parentElement.querySelector('.remarks-container');
                if (existingRemarks) existingRemarks.remove();

                const validRemarks = feedbackData.filter(f => f.remarks && f.remarks.trim() !== '');
                if (validRemarks.length > 0) {
                    const remarksHtml = validRemarks.map(f => {
                        // ... styling same as before ...
                        let color = '#64748b'; let bg = '#f1f5f9';
                        if (f.status.includes('Approved')) { color = '#059669'; bg = '#f0fdf4'; }
                        else if (f.status.includes('Approve with Revisions')) { color = '#d97706'; bg = '#fffbeb'; }
                        else if (f.status.includes('Rejected') || f.status.includes('Redefense')) { color = '#dc2626'; bg = '#fef2f2'; }

                        let headerText = f.panel;
                        let bodyText = f.remarks;
                        if (f.remarks.includes(':')) {
                            const parts = f.remarks.split(':');
                            headerText = parts[0].trim();
                            bodyText = parts.slice(1).join(':').trim();
                        }

                        return `
                            <div class="remarks-container" style="margin-top: 8px; background: ${bg}; opacity: 0.9; border-left: 3px solid ${color}; border-radius: 4px; padding: 10px 14px;">
                                <div style="display: flex; align-items: center; gap: 6px; margin-bottom:4px;">
                                    <span class="material-icons-round" style="font-size: 14px; color: ${color};">face</span>
                                    <span style="font-size: 0.75rem; font-weight: 700; color: ${color}; text-transform: uppercase;">${headerText}</span>
                                </div>
                                <div style="font-size: 0.9rem; color: #334155; line-height: 1.4;">
                                    ${bodyText}
                                </div>
                            </div>
                        `;
                    }).join('');
                    fileEl.parentElement.insertAdjacentHTML('beforeend', remarksHtml);
                }
            };

            // Render Titles
            renderField(tLinks, tStatus, tRemarks, 'title1', 'titleFile1', 'existing-link-1');
            renderField(tLinks, tStatus, tRemarks, 'title2', 'titleFile2', 'existing-link-2');
            renderField(tLinks, tStatus, tRemarks, 'title3', 'titleFile3', 'existing-link-3');

            // Render Pre-Oral
            renderField(pLinks, pStatus, pRemarks, 'ch1', 'preOralFile1', 'existing-pre-1');
            renderField(pLinks, pStatus, pRemarks, 'ch2', 'preOralFile2', 'existing-pre-2');
            renderField(pLinks, pStatus, pRemarks, 'ch3', 'preOralFile3', 'existing-pre-3');

            // Render Final
            renderField(fLinks, fStatus, fRemarks, 'ch4', 'finalFile4', 'existing-final-4');
            renderField(fLinks, fStatus, fRemarks, 'ch5', 'finalFile5', 'existing-final-5');

            // Store links in window.currentLinks - Handled globally now
            window.currentLinks = {
                titles: tLinks,
                preoral: pLinks,
                final: fLinks
            };

            // Initialize Button State
            updateSaveButtonState('titles');

        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

// Global Tab Switching Logic
window.switchSubTab = (stageId, index, btn) => {
    const parent = document.getElementById('tab-' + stageId);
    if (!parent) return;

    parent.querySelectorAll('.sub-tab-content').forEach(el => el.classList.remove('active'));

    const target = document.getElementById(`${stageId}-content-${index}`);
    if (target) target.classList.add('active');

    parent.querySelectorAll('.sub-tab-btn').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
};

window.switchSubmissionTab = (tabId, btn) => {
    // 1. Update UI Tabs
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');

    // Reset sub-tabs to the first one when switching main tabs
    const parent = document.getElementById('tab-' + tabId);
    const firstSubBtn = parent.querySelector('.sub-tab-btn');
    if (firstSubBtn && tabId !== 'titles') {
        // For titles, we don't want to auto-switch if they are clicking manually, 
        // but initial load needs it. 
        // Actually, just standard reset is fine.
        const firstIndex = tabId === 'final' ? 4 : 1;
        // logic for titles is 1, preoral 1, final 4? 
        // Titles IDs are 1,2,3. Preoral 1,2,3. Final 4,5.
        // Wait, preoral IDs in HTML are: preoral-content-1, 2, 3.
        // Final IDs: final-content-4, 5.
        // Title IDs: titles-content-1, 2, 3.

        let idx = 1;
        if (tabId === 'final') idx = 4;

        window.switchSubTab(tabId, idx, firstSubBtn);
    }

    // 2. Button/Input Locking Update
    updateSaveButtonState(tabId);
};

function updateSaveButtonState(tabId) {
    const saveBtn = document.querySelector('.save-btn');
    if (!saveBtn) return;

    // --- Schedule Check ---
    let isScheduled = true;
    if (window.scheduleStatus) {
        if (tabId === 'titles') isScheduled = window.scheduleStatus.title;
        else if (tabId === 'preoral') isScheduled = window.scheduleStatus.preoral;
        else if (tabId === 'final') isScheduled = window.scheduleStatus.final;
    }

    // Helper to lock inputs
    const lockInputs = (readonly, placeholderText) => {
        const tabEl = document.querySelector(`#tab-${tabId}`);
        if (tabEl) {
            tabEl.querySelectorAll('input').forEach(input => {
                input.readOnly = readonly;
                input.style.backgroundColor = readonly ? '#f1f5f9' : '#f8fafc';
                if (placeholderText) input.title = placeholderText; // Use title for hover info
            });
        }
    };

    if (!isScheduled) {
        saveBtn.innerHTML = '<span class="material-icons-round">event_busy</span> Not Scheduled';
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.7';
        saveBtn.style.cursor = 'not-allowed';
        saveBtn.title = "You have not been scheduled for this defense phase yet.";
        lockInputs(true, "Not Scheduled yet");
        return;
    }

    const hasAnyData = (obj) => Object.values(obj || {}).some(val => val && val.trim() !== '');

    // Ensure globally stored links are available
    if (!window.currentLinks) window.currentLinks = {};

    const stageLinks = window.currentLinks[tabId === 'titles' ? 'titles' : tabId === 'preoral' ? 'preoral' : 'final'];
    const isSubmitted = hasAnyData(stageLinks);

    if (isSubmitted) {
        saveBtn.innerHTML = '<span class="material-icons-round">check_circle</span> Submitted';
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.7';
        saveBtn.style.cursor = 'default';
        saveBtn.title = "";

        // Lock inputs
        lockInputs(true, "Submitted (View Only)");
    } else {
        saveBtn.innerHTML = '<span class="material-icons-round">save</span> Save Submissions';
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
        saveBtn.style.cursor = 'pointer';
        saveBtn.title = "";

        // Unlock inputs
        lockInputs(false, "");
    }
}

const showToast = (message, type = 'info') => {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toastMessage');
    const icon = document.getElementById('toastIcon');

    msg.innerText = message;

    if (type === 'success') {
        toast.style.backgroundColor = '#10b981';
        icon.innerText = 'check_circle';
    } else if (type === 'error') {
        toast.style.backgroundColor = '#ef4444';
        icon.innerText = 'error';
    } else if (type === 'warning') {
        toast.style.backgroundColor = '#f59e0b';
        icon.innerText = 'warning';
    } else {
        toast.style.backgroundColor = '#333';
        icon.innerText = 'info';
    }

    toast.style.visibility = 'visible';
    toast.style.animation = 'fadeIn 0.5s, fadeOut 0.5s 2.5s';

    setTimeout(() => {
        toast.style.visibility = 'hidden';
    }, 3000);
};

// Add CSS for animation
const style = document.createElement('style');
style.innerHTML = `
@keyframes fadeIn { from {opacity: 0;} to {opacity: 1;} }
@keyframes fadeOut { from {opacity: 1;} to {opacity: 0;} }
`;
document.head.appendChild(style);

window.saveSubmissions = async function () {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser) {
        showToast('You must be logged in to save.', 'error');
        return;
    }

    const btn = document.querySelector('.save-btn');
    const originalContent = btn.innerHTML; // Save original HTML

    btn.innerHTML = '<span class="material-icons-round spin">sync</span> Uploading...';
    btn.disabled = true;

    const activeTab = document.querySelector('.tab-btn.active');
    const tabId = activeTab.innerText.toLowerCase().includes('title') ? 'titles' :
        activeTab.innerText.toLowerCase().includes('pre') ? 'preoral' : 'final';

    let updates = {};
    let activeLinks = {}; // This will hold the URLs to save

    // Helper to upload file and get URL
    const uploadFile = async (fileInputId, existingUrl) => {
        const input = document.getElementById(fileInputId);
        if (input && input.files.length > 0) {
            const file = input.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${loginUser.id}_${Date.now()}_${fileInputId}.${fileExt}`;
            const filePath = `${tabId}/${fileName}`;

            const { data, error } = await supabaseClient.storage
                .from('submissions')
                .upload(filePath, file);

            if (error) {
                console.error(`Upload failed for ${fileInputId}:`, error);
                throw error;
            }

            const { data: publicData } = supabaseClient.storage
                .from('submissions')
                .getPublicUrl(filePath);

            return publicData.publicUrl;
        }
        return existingUrl; // Return existing if no new file
    };

    try {
        // Collect existing links first to avoid overwriting with empty
        const currentLinks = window.currentLinks[tabId] || {};

        if (tabId === 'titles') {
            activeLinks = {
                title1: await uploadFile('titleFile1', currentLinks.title1),
                title2: await uploadFile('titleFile2', currentLinks.title2),
                title3: await uploadFile('titleFile3', currentLinks.title3)
            };
            updates.title_link = JSON.stringify(activeLinks);

            const pTitles = {
                title1: document.getElementById('projectTitle1') ? document.getElementById('projectTitle1').value.trim() : '',
                title2: document.getElementById('projectTitle2') ? document.getElementById('projectTitle2').value.trim() : '',
                title3: document.getElementById('projectTitle3') ? document.getElementById('projectTitle3').value.trim() : ''
            };
            updates.project_title = JSON.stringify(pTitles);

        } else if (tabId === 'preoral') {
            activeLinks = {
                ch1: await uploadFile('preOralFile1', currentLinks.ch1),
                ch2: await uploadFile('preOralFile2', currentLinks.ch2),
                ch3: await uploadFile('preOralFile3', currentLinks.ch3)
            };
            updates.pre_oral_link = JSON.stringify(activeLinks);

        } else if (tabId === 'final') {
            activeLinks = {
                ch4: await uploadFile('finalFile4', currentLinks.ch4),
                ch5: await uploadFile('finalFile5', currentLinks.ch5)
            };
            updates.final_link = JSON.stringify(activeLinks);
        }

        // Save to DB
        const { error } = await supabaseClient
            .from('student_groups')
            .update(updates)
            .eq('id', loginUser.id);

        if (error) throw error;

        showToast('Files uploaded & saved successfully!', 'success');

        // Update local state and lock
        window.currentLinks[tabId] = activeLinks;
        // Reload to show "View File" buttons
        loadSubmissionData();
        // window.switchSubmissionTab(tabId, activeTab);

    } catch (err) {
        console.error('Submission error:', err);
        btn.innerHTML = originalContent;
        btn.disabled = false;
        showToast('Failed to save: ' + err.message, 'error');
    }
}

