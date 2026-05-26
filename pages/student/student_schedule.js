// student_schedule.js

document.addEventListener('DOMContentLoaded', () => {
    loadMySchedule();
});

async function loadMySchedule() {
    const container = document.getElementById('scheduleContainer');
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));

    if (!loginUser) {
        window.location.href = '../../';
        return;
    }

    try {
        // Fetch ALL schedules for this group
        const { data: schedules, error } = await supabaseClient
            .from('schedules')
            .select('*')
            .eq('group_id', loginUser.id)
            .order('schedule_date', { ascending: true }); // ASC to show upcoming first

        if (error) throw error;

        if (!schedules || schedules.length === 0) {
            renderNoSchedule(container);
            return;
        }

        renderSchedules(container, schedules);

    } catch (err) {
        console.error('Error loading schedule:', err);
        const tableBody = document.getElementById('scheduleTableBody');
        if (tableBody) {
            tableBody.innerHTML = `
                <tr><td colspan="6" style="text-align: center; padding: 30px; color: #ef4444;">
                     Error loading schedule. Please try again later.
                </td></tr>
            `;
        }
    }
}

function renderNoSchedule(container) {
    const tableBody = document.getElementById('scheduleTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = `
        <tr><td colspan="6" style="text-align: center; padding: 40px; color: #94a3b8;">
            <span class="material-icons-round" style="font-size: 32px; opacity: 0.5;">event_busy</span>
            <p style="margin: 10px 0 0;">No schedule posted yet.</p>
        </td></tr>
    `;
}

function renderSchedules(container, schedules) {
    const tableBody = document.getElementById('scheduleTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = ''; // Clear

    schedules.forEach(sched => {
        // Format Date
        const dateObj = new Date(sched.schedule_date);
        const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

        // Format Time
        const timeStr = new Date(`2000-01-01T${sched.schedule_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        // Collect Panels
        const panels = [
            sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5
        ].filter(p => p); // remove null/empty

        // Main Row
        const row = document.createElement('tr');
        row.className = 'main-row';
        row.id = `sched-row-${sched.id}`;
        row.onclick = () => toggleScheduleRow(sched.id);

        row.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="material-icons-round expand-icon" id="sched-icon-${sched.id}">expand_more</span>
                    <span style="font-weight: 500; color: var(--accent-color);">${sched.schedule_type || 'Defense'}</span>
                </div>
            </td>
            <td style="font-weight: 500;">${dateStr}</td>
            <td style="color: #64748b;">${timeStr}</td>
            <td style="font-weight: 500;">${sched.schedule_venue || 'TBA'}</td>
            <td>
                 <span class="status-badge" style="background: #eef2ff; color: var(--primary-color);">
                    ${panels.length} Panel(s)
                </span>
            </td>
            <td>
                <span style="font-size: 0.85em; color: var(--primary-color); font-weight: 600;">View Details</span>
            </td>
        `;
        tableBody.appendChild(row);

        // Details Row
        const detailsRow = document.createElement('tr');
        detailsRow.className = 'details-row';
        detailsRow.id = `sched-details-${sched.id}`;

        detailsRow.innerHTML = `
            <td colspan="6" style="padding: 0;">
                <div class="details-content">
                    <div class="details-column">
                        <h4>Defense Details</h4>
                        <p><strong style="color: #64748b;">VENUE:</strong> ${sched.schedule_venue || 'TBA'}</p>
                        <p><strong style="color: #64748b;">ADVISER:</strong> ${sched.adviser || 'Not Assigned'}</p>
                    </div>
                    <div class="details-column">
                        <h4>Panel Members</h4>
                        <ul style="margin: 0; padding-left: 20px; color: #334155;">
                            ${panels.length > 0 ? panels.map(p => `<li>${p}</li>`).join('') : '<li style="font-style: italic; color: #94a3b8;">No panels assigned</li>'}
                        </ul>
                    </div>
                </div>
            </td>
        `;
        tableBody.appendChild(detailsRow);
    });
}

// Toggle Row Helper
window.toggleScheduleRow = function (id) {
    const details = document.getElementById(`sched-details-${id}`);
    const row = document.getElementById(`sched-row-${id}`);

    if (details && row) {
        details.classList.toggle('active');
        row.classList.toggle('expanded');
    }
}



// --- Details Modal (Read-only) ---
function openDetailsModal(sched) {
    document.getElementById('viewGroupHeader').textContent = sched.student_groups?.group_name || 'Unknown Group';

    const typeBadge = document.getElementById('viewTypeBadge');
    typeBadge.textContent = sched.schedule_type;
    typeBadge.className = 'type-badge ' + (
        sched.schedule_type.toLowerCase().includes('title') ? 'type-title' :
            (sched.schedule_type.toLowerCase().includes('pre-oral') || sched.schedule_type.toLowerCase().includes('preoral')) ? 'type-pre-oral' :
                'type-final'
    );

    const timeStr = typeof formatTime12Hour === 'function' && sched.schedule_time ? formatTime12Hour(sched.schedule_time) : (sched.schedule_time || 'TBA');
    
    document.getElementById('viewDateTime').textContent = `${new Date(sched.schedule_date).toLocaleDateString()} at ${timeStr}`;
    document.getElementById('viewVenue').textContent = sched.schedule_venue || 'TBA';
    document.getElementById('viewProgram').textContent = (sched.student_groups?.program || 'N/A').toUpperCase();
    document.getElementById('viewAdviser').textContent = sched.adviser || sched.student_groups?.adviser || 'N/A';

    const panelsContainer = document.getElementById('viewPanels');
    panelsContainer.innerHTML = '';
    const panels = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5].filter(p => p);

    if (panels.length === 0) {
        panelsContainer.innerHTML = '<span style="color:#94a3b8; font-style:italic;">No panels assigned.</span>';
    } else {
        panels.forEach(p => {
            const chip = document.createElement('span');
            chip.style.cssText = `
                display: inline-block;
                padding: 6px 12px;
                background: #f1f5f9;
                color: #475569;
                font-weight: 600;
                font-size: 0.85rem;
                border-radius: 8px;
                margin-right: 5px;
                margin-bottom: 5px;
            `;
            chip.textContent = p;
            panelsContainer.appendChild(chip);
        });
    }

    document.getElementById('detailsModal').classList.add('active');
}

function closeDetailsModal() {
    document.getElementById('detailsModal').classList.remove('active');
}
