// Baking journal functionality

// Store journal entries
let journalEntries = [];

// Initialize journal
document.addEventListener('DOMContentLoaded', () => {
    // Load saved journal entries
    loadJournalEntries();
    
    // Setup journal form
    setupJournalForm();
});

// Load journal entries from storage
function loadJournalEntries() {
    // In a real app, would load from localStorage or IndexedDB
    // For now, we'll use localStorage
    
    const savedEntries = localStorage.getItem('journalEntries');
    if (savedEntries) {
        const parsed = JSON.parse(savedEntries);
        // Convert date strings back to Date objects
        journalEntries = parsed.map(entry => ({
            ...entry,
            date: new Date(entry.date)
        }));
    } else {
        journalEntries = [];
    }
    
    // Display entries
    displayJournalEntries();
}

// Display journal entries in the UI
function displayJournalEntries() {
    const journalEntriesEl = document.getElementById('journal-entries');
    
    if (journalEntries.length === 0) {
        journalEntriesEl.innerHTML = '<p class="no-entries">No journal entries yet. Add your first baking result!</p>';
        return;
    }
    
    let entriesHTML = '';
    journalEntries.forEach(entry => {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            stars += i <= entry.rating ? '★' : '☆';
        }
        
        entriesHTML += `
            <div class="journal-entry" data-entry-id="${entry.id}">
                <div class="entry-header">
                    <h3>${entry.title}</h3>
                    <div class="entry-date">${formatDate(entry.date)}</div>
                </div>
                <div class="entry-rating">${stars}</div>
                <p>${entry.recipeName}</p>
                <p>${truncateText(entry.notes, 100)}</p>
            </div>
        `;
    });
    
    journalEntriesEl.innerHTML = entriesHTML;
    
    // Add click event listeners
    document.querySelectorAll('.journal-entry').forEach(el => {
        el.addEventListener('click', () => {
            const entryId = el.getAttribute('data-entry-id');
            showJournalEntryDetails(entryId);
        });
    });
}

// Show journal entry details
function showJournalEntryDetails(entryId) {
    const entry = journalEntries.find(e => e.id === entryId);
    if (!entry) return;
    
    const journalDetail = document.getElementById('journal-detail');
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        stars += i <= entry.rating ? '★' : '☆';
    }
    
    // Create timeline HTML if timeline data exists
    let timelineHTML = '';
    if (entry.timeline && entry.timeline.length > 0) {
        timelineHTML = `
            <div class="entry-timeline">
                <h4>Baking Timeline</h4>
                <div class="compact-timeline">
                    ${generateCompactTimeline(entry.timeline)}
                </div>
            </div>
        `;
    }
    
    journalDetail.innerHTML = `
        <div class="journal-entry-detail">
            <div class="entry-header">
                <h3>${entry.title}</h3>
                <div class="entry-date">${formatDate(entry.date)}</div>
            </div>
            
            <div class="entry-rating">${stars}</div>
            
            <div class="entry-recipe">Recipe: ${entry.recipeName}</div>
            
            <div class="entry-environmental">
                <p>Temperature: ${entry.environmentalData.temperature}°F</p>
                <p>Humidity: ${entry.environmentalData.humidity}%</p>
            </div>
            
            ${timelineHTML}
            
            ${entry.photoUrl ? `
                <div class="entry-photo">
                    <img src="${entry.photoUrl}" alt="${entry.title}" />
                </div>
            ` : ''}
            
            <div class="entry-notes">
                <h4>Notes & Lessons Learned</h4>
                <p>${entry.notes}</p>
            </div>
            
            <div class="entry-actions">
                <button id="edit-journal-entry" class="btn-primary">Edit Entry</button>
                <button id="delete-journal-entry" class="btn-secondary">Delete Entry</button>
                <button id="back-to-journal" class="btn-secondary">Back to Journal</button>
            </div>
        </div>
    `;
    
    journalDetail.classList.remove('hidden');
    document.getElementById('journal-entries').style.display = 'none';
    document.getElementById('add-journal-entry').style.display = 'none';
    
    // Add event listeners
    document.getElementById('back-to-journal').addEventListener('click', hideJournalEntryDetails);
    document.getElementById('edit-journal-entry').addEventListener('click', () => editJournalEntry(entryId));
    document.getElementById('delete-journal-entry').addEventListener('click', () => deleteJournalEntry(entryId));
}

// Generate a compact, beautiful timeline visualization
function generateCompactTimeline(timeline) {
    if (!timeline || !Array.isArray(timeline) || timeline.length === 0) {
        return '<p>No timeline data available</p>';
    }
    
    // Sort timeline by start time
    const sortedTimeline = [...timeline].sort((a, b) => {
        return new Date(a.startTime) - new Date(b.startTime);
    });
    
    // Calculate total bake time from first step start to last step end
    const firstStepStart = new Date(sortedTimeline[0].startTime);
    const lastStepEnd = new Date(sortedTimeline[sortedTimeline.length - 1].endTime || Date.now());
    const totalDuration = lastStepEnd - firstStepStart;
    
    // Generate HTML for the compact timeline
    let html = `
        <div class="timeline-overview">
            <div class="timeline-total">
                <span>Total bake time: ${formatDuration(Math.floor(totalDuration / 1000))}</span>
                <span>Started: ${formatDateTime(firstStepStart)}</span>
                <span>Completed: ${formatDateTime(lastStepEnd)}</span>
            </div>
            <div class="timeline-visualization">
    `;
    
    // Create the visual representation
    html += '<div class="timeline-bar">';
    
    sortedTimeline.forEach((step, index) => {
        const startTime = new Date(step.startTime);
        const endTime = new Date(step.endTime || Date.now());
        const duration = endTime - startTime;
        const percentage = (duration / totalDuration) * 100;
        
        // Create a segment for each step with width proportional to duration
        html += `
            <div class="timeline-segment" style="width: ${percentage}%" data-step="${step.step}">
                <div class="segment-label">${step.step}</div>
            </div>
        `;
    });
    
    html += '</div></div>';
    
    // Add detailed steps below with actual times
    html += '<div class="timeline-details">';
    
    sortedTimeline.forEach((step, index) => {
        const startTime = new Date(step.startTime);
        const endTime = step.endTime ? new Date(step.endTime) : null;
        const duration = endTime ? endTime - startTime : 'In progress';
        
        html += `
            <div class="timeline-step">
                <h5>${step.step}</h5>
                <div class="step-times">
                    <div>Started: ${formatDateTime(startTime)}</div>
                    ${endTime ? `
                        <div>Ended: ${formatDateTime(endTime)}</div>
                        <div>Duration: ${typeof duration === 'number' ? formatDuration(Math.floor(duration / 1000)) : duration}</div>
                    ` : '<div>In progress</div>'}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    return html;
}

// Format duration in seconds to readable format
function formatDuration(seconds) {
    if (seconds < 60) {
        return `${seconds}s`;
    }
    
    const minutes = Math.floor(seconds / 60) % 60;
    const hours = Math.floor(seconds / 3600) % 24;
    const days = Math.floor(seconds / 86400);
    
    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0) result += `${minutes}m`;
    
    return result.trim();
}

// Format date and time
function formatDateTime(date) {
    return new Date(date).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Hide journal entry details
function hideJournalEntryDetails() {
    document.getElementById('journal-detail').classList.add('hidden');
    document.getElementById('journal-entries').style.display = 'grid';
    document.getElementById('add-journal-entry').style.display = 'block';
}

// Setup journal form
function setupJournalForm() {
    const form = document.getElementById('journal-form');
    
    // Modify the journal form to include temperature and humidity fields
    const environmentalGroup = document.createElement('div');
    environmentalGroup.className = 'form-group';
    environmentalGroup.innerHTML = `
        <h4>Baking Environment</h4>
        <div class="environmental-inputs">
            <div class="input-group">
                <label for="entry-temperature">Temperature (°F):</label>
                <input type="number" id="entry-temperature" min="32" max="120" value="${window.currentWeather?.temperature || 72}">
            </div>
            <div class="input-group">
                <label for="entry-humidity">Humidity (%):</label>
                <input type="number" id="entry-humidity" min="0" max="100" value="${window.currentWeather?.humidity || 50}">
            </div>
        </div>
    `;
    
    // Insert before the notes field
    const notesGroup = form.querySelector('div.form-group:nth-of-type(5)');
    form.insertBefore(environmentalGroup, notesGroup);
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveJournalEntry();
    });
    
    // Populate recipe dropdown
    const recipeSelect = document.getElementById('entry-recipe');
    const recipes = window.recipes || { tartine: { name: 'Basic Country Sourdough' } };
    
    recipeSelect.innerHTML = '';
    Object.keys(recipes).forEach(recipeId => {
        const option = document.createElement('option');
        option.value = recipeId;
        option.textContent = recipes[recipeId].name;
        recipeSelect.appendChild(option);
    });
    
    // Add session selector
    addSessionSelector();
}

// Add session selector to the journal form
function addSessionSelector() {
    // Check if we already have a session selector
    if (document.getElementById('session-selector-group')) {
        return;
    }
    
    // Try to get recent sessions from localStorage
    let sessions = [];
    try {
        sessions = JSON.parse(localStorage.getItem('cindysBreadSessions') || '[]');
        // Filter to completed sessions in the last week
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        sessions = sessions.filter(session => 
            (session.isComplete || 
             (session.timeline && session.timeline.some(step => step.step === 'Complete'))) && 
            new Date(session.startTime) > oneWeekAgo
        );
    } catch (e) {
        console.error('Error loading sessions for journal:', e);
    }
    
    if (sessions.length === 0) {
        return; // No sessions to select from
    }
    
    // Create the session selector
    const selectorGroup = document.createElement('div');
    selectorGroup.className = 'form-group';
    selectorGroup.id = 'session-selector-group';
    
    let selectorHTML = `
        <h4>Use Baking Session Data</h4>
        <p>Select a recent baking session to automatically include its timeline:</p>
        <select id="session-selector">
            <option value="">-- Select a session --</option>
    `;
    
    sessions.forEach(session => {
        const sessionDate = new Date(session.startTime).toLocaleDateString();
        selectorHTML += `<option value="${session.id}">${session.recipeName} (${sessionDate})</option>`;
    });
    
    selectorHTML += `
        </select>
        <div id="session-preview" class="hidden">
            <h5>Session Timeline Preview</h5>
            <div id="session-timeline-preview"></div>
        </div>
    `;
    
    selectorGroup.innerHTML = selectorHTML;
    
    // Insert after the recipe selection
    const recipeGroup = document.querySelector('div.form-group:nth-of-type(3)');
    recipeGroup.parentNode.insertBefore(selectorGroup, recipeGroup.nextSibling);
    
    // Add event listener to session selector
    document.getElementById('session-selector').addEventListener('change', function() {
        const sessionId = this.value;
        if (!sessionId) {
            document.getElementById('session-preview').classList.add('hidden');
            return;
        }
        
        // Find the selected session
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;
        
        // Auto-populate recipe field
        document.getElementById('entry-recipe').value = session.recipeId;
        
        // Update form with session timeline preview
        const previewEl = document.getElementById('session-timeline-preview');
        if (session.timeline && session.timeline.length > 0) {
            previewEl.innerHTML = generateCompactTimeline(session.timeline);
            document.getElementById('session-preview').classList.remove('hidden');
        } else {
            previewEl.innerHTML = '<p>No timeline data available for this session</p>';
            document.getElementById('session-preview').classList.remove('hidden');
        }
    });
}

// Create new journal entry
function createNewJournalEntry() {
    // Clear form
    document.getElementById('entry-title').value = '';
    document.getElementById('entry-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('entry-notes').value = '';
    document.getElementById('entry-rating').value = 0;
    document.getElementById('photo-preview').style.backgroundImage = 'none';
    
    // Set current environmental conditions
    if (window.currentWeather) {
        document.getElementById('entry-temperature').value = window.currentWeather.temperature;
        document.getElementById('entry-humidity').value = window.currentWeather.humidity;
    }
    
    // Reset rating stars
    document.querySelectorAll('.star').forEach(star => {
        star.classList.remove('active');
    });
    
    // Add session selector
    addSessionSelector();
    
    // Show form
    document.getElementById('new-journal-entry').classList.remove('hidden');
    document.getElementById('journal-entries').style.display = 'none';
    document.getElementById('journal-detail').classList.add('hidden');
    document.getElementById('add-journal-entry').style.display = 'none';
}

// Edit journal entry
function editJournalEntry(entryId) {
    const entry = journalEntries.find(e => e.id === entryId);
    if (!entry) return;
    
    // Fill form with entry data
    document.getElementById('entry-title').value = entry.title;
    document.getElementById('entry-date').value = entry.date.toISOString().split('T')[0];
    document.getElementById('entry-recipe').value = entry.recipeId;
    document.getElementById('entry-notes').value = entry.notes;
    document.getElementById('entry-rating').value = entry.rating;
    
    // Fill environmental data
    document.getElementById('entry-temperature').value = entry.environmentalData.temperature;
    document.getElementById('entry-humidity').value = entry.environmentalData.humidity;
    
    // Update rating stars
    document.querySelectorAll('.star').forEach(star => {
        const rating = parseInt(star.getAttribute('data-rating'));
        if (rating <= entry.rating) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
    
    // Update photo preview if available
    if (entry.photoUrl) {
        document.getElementById('photo-preview').style.backgroundImage = `url(${entry.photoUrl})`;
    } else {
        document.getElementById('photo-preview').style.backgroundImage = 'none';
    }
    
    // Add session selector
    addSessionSelector();
    
    // Show form
    document.getElementById('new-journal-entry').classList.remove('hidden');
    document.getElementById('journal-entries').style.display = 'none';
    document.getElementById('journal-detail').classList.add('hidden');
    document.getElementById('add-journal-entry').style.display = 'none';
    
    // Update form to know we're editing
    document.getElementById('journal-form').setAttribute('data-editing-id', entryId);
}

// Save journal entry
function saveJournalEntry() {
    // Get form data
    const title = document.getElementById('entry-title').value;
    const date = new Date(document.getElementById('entry-date').value);
    const recipeId = document.getElementById('entry-recipe').value;
    const recipeName = document.querySelector(`#entry-recipe option[value="${recipeId}"]`).textContent;
    const rating = parseInt(document.getElementById('entry-rating').value);
    const notes = document.getElementById('entry-notes').value;
    
    // Get environmental data from the form fields
    const environmentalData = {
        temperature: parseFloat(document.getElementById('entry-temperature').value),
        humidity: parseFloat(document.getElementById('entry-humidity').value)
    };
    
    // Get timeline data from selected session if any
    let timeline = [];
    const sessionSelector = document.getElementById('session-selector');
    if (sessionSelector && sessionSelector.value) {
        try {
            const sessions = JSON.parse(localStorage.getItem('cindysBreadSessions') || '[]');
            const selectedSession = sessions.find(s => s.id === sessionSelector.value);
            if (selectedSession && selectedSession.timeline) {
                timeline = selectedSession.timeline;
            }
        } catch (e) {
            console.error('Error loading session timeline:', e);
        }
    }
    
    // Check if editing or creating new
    const editingId = document.getElementById('journal-form').getAttribute('data-editing-id');
    let newEntry;
    
    if (editingId) {
        // Update existing entry
        const index = journalEntries.findIndex(e => e.id === editingId);
        if (index !== -1) {
            // Keep existing timeline if no new one is selected
            if (timeline.length === 0 && journalEntries[index].timeline) {
                timeline = journalEntries[index].timeline;
            }
            
            journalEntries[index] = {
                ...journalEntries[index],
                title,
                date,
                recipeId,
                recipeName,
                rating,
                notes,
                environmentalData,
                timeline
            };
        }
    } else {
        // Create new entry
        newEntry = {
            id: 'journal' + Date.now(),
            title,
            date,
            recipeId,
            recipeName,
            rating,
            notes,
            environmentalData,
            timeline,
            // Handle photo if implemented
            photoUrl: '' // Replace with actual photo URL if implemented
        };
        
        journalEntries.push(newEntry);
    }
    
    // Save to storage
    saveEntriesToStorage();
    
    // Return to journal listing
    hideNewJournalEntry();
    displayJournalEntries();
}

// Delete journal entry
function deleteJournalEntry(entryId) {
    if (confirm('Are you sure you want to delete this journal entry?')) {
        journalEntries = journalEntries.filter(e => e.id !== entryId);
        saveEntriesToStorage();
        hideJournalEntryDetails();
        displayJournalEntries();
    }
}

// Save entries to storage
function saveEntriesToStorage() {
    localStorage.setItem('journalEntries', JSON.stringify(journalEntries));
}

// Helper: Truncate text
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
}

// Helper: Format date
function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
} 