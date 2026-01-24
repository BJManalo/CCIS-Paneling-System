// Global state to track grading
let gradingStatus = {
    titles: false,
    preoral: false,
    final: false
};
let currentTab = 'titles';

document.addEventListener('DOMContentLoaded', () => {
    loadSubmissionData();
});

async function loadSubmissionData() {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));

    if (!loginUser) {
        window.location.href = '../../index.html';
        return;
    }

    let groupId = loginUser.id;

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

            gradingStatus.titles = checkGraded('Title');
            gradingStatus.preoral = checkGraded('Pre');
            gradingStatus.final = checkGraded('Final');

            // Lock/Unlock Tab Buttons
            const preOralBtn = document.querySelector('button[onclick*="preoral"]');
            const finalBtn = document.querySelector('button[onclick*="final"]');

            if (!gradingStatus.titles) {
                preOralBtn.disabled = true;
                preOralBtn.style.opacity = '0.5';
                preOralBtn.style.cursor = 'not-allowed';
                preOralBtn.title = "Locked: Title Defense grades pending.";
                if (!preOralBtn.innerHTML.includes('lock')) {
                    preOralBtn.innerHTML += ' <span class="material-icons-round" style="font-size:14px; vertical-align:middle;">lock</span>';
                }
            }

            if (!gradingStatus.preoral) {
                finalBtn.disabled = true;
                finalBtn.style.opacity = '0.5';
                finalBtn.style.cursor = 'not-allowed';
                finalBtn.title = "Locked: Pre-Oral grades pending.";
                if (!finalBtn.innerHTML.includes('lock')) {
                    finalBtn.innerHTML += ' <span class="material-icons-round" style="font-size:14px; vertical-align:middle;">lock</span>';
                }
            }

            // Sync Save Button State
            updateSaveButtonStatus();

            // Function to safely parse JSON
            const safeParse = (str) => {
                try { return JSON.parse(str || '{}'); } catch (e) { return {}; }
            };

            // Parse File Links
            let tLinks = safeParse(group.title_link);
            if (group.title_link && typeof group.title_link === 'string' && !group.title_link.startsWith('{')) tLinks = { title1: group.title_link };

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

            // Helper to render status badge and remarks
            const renderField = (linkMap, statusMap, remarksMap, key, elementId) => {
                const el = document.getElementById(elementId);
                if (!el) return;

                el.value = linkMap[key] || '';

                const status = statusMap[key] || 'Pending';
                const remarks = remarksMap[key] || '';

                // Define Colors & Icons
                let color = '#64748b'; // Slate (Pending)
                let icon = 'hourglass_empty';
                let bg = '#f1f5f9';
                let border = '#e2e8f0';

                if (status.includes('Approved')) {
                    color = '#059669'; icon = 'check_circle'; bg = '#f0fdf4'; border = '#bbf7d0';
                } else if (status.includes('Approve with Revisions')) {
                    color = '#d97706'; icon = 'warning'; bg = '#fffbeb'; border = '#fde68a';
                } else if (status.includes('Rejected') || status.includes('Redefense')) {
                    color = '#dc2626'; icon = 'cancel'; bg = '#fef2f2'; border = '#fecaca';
                }

                // 1. Label & Badge Wrapper
                // We find the label associated with this input (if any) or create a unified header
                // Note: The HTML structure has labels like "Link" or implicit. 
                // Let's create a header div that REPLACES the simple "Link" text if it exists above

                const prevEl = el.previousElementSibling;
                if (prevEl && (prevEl.classList.contains('status-badge-container') || prevEl.innerText === 'Link')) {
                    prevEl.remove();
                }

                const headerHtml = `
                    <div class="status-badge-container" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                        <span style="font-size: 0.85rem; font-weight: 600; color: #475569;">Submission Link</span>
                        <div style="font-size: 0.7rem; font-weight: 700; color: ${color}; background: ${bg}; border: 1px solid ${border}; padding: 2px 8px; border-radius: 6px; display: flex; align-items: center; gap: 4px; text-transform: uppercase; letter-spacing: 0.5px;">
                            <span class="material-icons-round" style="font-size: 12px;">${icon}</span>
                            ${status}
                        </div>
                    </div>
                `;
                el.insertAdjacentHTML('beforebegin', headerHtml);

                // 2. Remarks (Clean Design)
                const nextEl = el.nextElementSibling;
                if (nextEl && nextEl.classList.contains('remarks-container')) nextEl.remove();

                if (remarks) {
                    // Split remark to separate Name from Comment if possible for styling
                    // We assume "Name: Comment" format
                    let headerText = 'Panel Feedback';
                    let bodyText = remarks;

                    if (remarks.includes(':')) {
                        const parts = remarks.split(':');
                        headerText = parts[0].trim();
                        bodyText = parts.slice(1).join(':').trim();
                    }

                    const remarksHtml = `
                        <div class="remarks-container" style="margin-top: 8px; background: ${bg}; opacity: 0.9; border-left: 3px solid ${color}; border-radius: 0 6px 6px 0; padding: 10px 14px; display: flex; flex-direction: column; gap: 2px;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span class="material-icons-round" style="font-size: 14px; color: ${color};">face</span>
                                <span style="font-size: 0.75rem; font-weight: 700; color: ${color}; text-transform: uppercase;">${headerText}</span>
                            </div>
                            <div style="font-size: 0.9rem; color: #334155; line-height: 1.5; margin-left: 20px;">
                                ${bodyText}
                            </div>
                        </div>
                    `;
                    el.insertAdjacentHTML('afterend', remarksHtml);
                }
            };

            // Render Titles
            renderField(tLinks, tStatus, tRemarks, 'title1', 'titleLink1');
            renderField(tLinks, tStatus, tRemarks, 'title2', 'titleLink2');
            renderField(tLinks, tStatus, tRemarks, 'title3', 'titleLink3');

            // Render Pre-Oral
            renderField(pLinks, pStatus, pRemarks, 'ch1', 'preOralCh1');
            renderField(pLinks, pStatus, pRemarks, 'ch2', 'preOralCh2');
            renderField(pLinks, pStatus, pRemarks, 'ch3', 'preOralCh3');

            // Render Final
            renderField(fLinks, fStatus, fRemarks, 'ch4', 'finalCh4');
            renderField(fLinks, fStatus, fRemarks, 'ch5', 'finalCh5');
        }

    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

const showToast = (message, type = 'info') => {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toastMessage');
    const icon = document.getElementById('toastIcon');

    msg.innerText = message;

    if (type === 'success') {
        toast.style.backgroundColor = '#10b981'; // Green
        icon.innerText = 'check_circle';
    } else if (type === 'error') {
        toast.style.backgroundColor = '#ef4444'; // Red
        icon.innerText = 'error';
    } else if (type === 'warning') {
        toast.style.backgroundColor = '#f59e0b'; // Amber
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
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.spin { display: inline - block; animation: spin 1s linear infinite; }
`;
document.head.appendChild(style);

// Tab Switching with Button State Update
window.switchSubmissionTab = function (tabId, btn) {
    currentTab = tabId;
    
    // UI logic (formerly in HTML)
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');

    // Update the Save Button
    updateSaveButtonStatus();
};

function updateSaveButtonStatus() {
    const btn = document.querySelector('.save-btn');
    if (!btn) return;

    const isGraded = gradingStatus[currentTab];
    
    if (isGraded) {
        btn.innerHTML = '<span class="material-icons-round">check_circle</span> Submitted';
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.style.cursor = 'not-allowed';
        btn.title = "This stage has been graded and can no longer be modified.";
    } else {
        btn.innerHTML = '<span class="material-icons-round">save</span> Save Submissions';
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.title = "";
    }
}

window.saveSubmissions = async function () {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser) {
        showToast('You must be logged in to save.', 'error');
        return;
    }

    const btn = document.querySelector('.save-btn');
    const originalContent = btn.innerHTML; // Save original HTML (icon + text)

    btn.innerHTML = '<span class="material-icons-round spin">sync</span> Saving...';
    btn.disabled = true;

    // Collect data into JSON objects
    const tLinks = {
        title1: document.getElementById('titleLink1').value.trim(),
        title2: document.getElementById('titleLink2').value.trim(),
        title3: document.getElementById('titleLink3').value.trim()
    };

    const pLinks = {
        ch1: document.getElementById('preOralCh1').value.trim(),
        ch2: document.getElementById('preOralCh2').value.trim(),
        ch3: document.getElementById('preOralCh3').value.trim()
    };

    const fLinks = {
        ch4: document.getElementById('finalCh4').value.trim(),
        ch5: document.getElementById('finalCh5').value.trim()
    };

    const updates = {
        title_link: JSON.stringify(tLinks),
        pre_oral_link: JSON.stringify(pLinks),
        final_link: JSON.stringify(fLinks)
    };

    try {
        const { error } = await supabaseClient
            .from('student_groups')
            .update(updates)
            .eq('id', loginUser.id);

        if (error) throw error;

        showToast('Submissions saved successfully!', 'success');

        // Immediate Visual Feedback: Lock as "Submitted"
        btn.innerHTML = '<span class="material-icons-round">check_circle</span> Submitted';
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.style.cursor = 'not-allowed';

    } catch (err) {
        console.error('Submission error:', err);

        if (err.message && err.message.includes('schema cache')) {
            showToast('System Error: Database schema out of sync. Please contact Administrator.', 'error');
        } else {
            showToast('Failed to save: ' + err.message, 'error');
        }
        
        // Restore button only on error
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

