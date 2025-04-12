document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const startSessionBtn = document.getElementById('start-session');
    const exportLogBtn = document.getElementById('export-log');
    const currentStepSection = document.getElementById('current-step');
    const stepTitle = document.getElementById('step-title');
    const stepInstructions = document.getElementById('step-instructions');
    const timerContainer = document.getElementById('timer-container');
    const timerDisplay = document.getElementById('timer-display');
    const startTimerBtn = document.getElementById('start-timer');
    const pauseTimerBtn = document.getElementById('pause-timer');
    const resetTimerBtn = document.getElementById('reset-timer');
    const prevStepBtn = document.getElementById('prev-step');
    const completeStepBtn = document.getElementById('complete-step');
    const logEntries = document.getElementById('log-entries');

    // Application state
    let currentStepIndex = 0;
    let activeTimer = null;
    let breadSession = {
        startTime: null,
        currentStep: null,
        logs: [],
        completedSteps: []
    };

    // Functions
    function addLogEntry(message, isStepCompletion = false) {
        const timestamp = new Date();
        const entry = {
            timestamp,
            message,
            isStepCompletion
        };
        
        breadSession.logs.push(entry);
        
        // Create log entry in UI
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        if (isStepCompletion) {
            logEntry.className += ' completed';
        }
        
        // Create timestamp element
        const timestampEl = document.createElement('div');
        timestampEl.className = 'log-timestamp';
        timestampEl.textContent = `${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}`;
        
        // Create message element
        const messageEl = document.createElement('div');
        messageEl.className = 'log-message';
        messageEl.textContent = message;
        
        // Append to log entry
        logEntry.appendChild(timestampEl);
        logEntry.appendChild(messageEl);
        
        // Add to log entries (prepend to show newest first)
        logEntries.insertBefore(logEntry, logEntries.firstChild);
        
        // Update export button state
        exportLogBtn.disabled = breadSession.logs.length === 0;
    }

    function loadStep(index) {
        if (index < 0 || index >= recipeSteps.length) return;
        
        // Update current step index
        currentStepIndex = index;
        const step = recipeSteps[currentStepIndex];
        breadSession.currentStep = step;
        
        // Update UI with step details
        stepTitle.textContent = step.title;
        stepInstructions.innerHTML = step.instructions;
        
        // Handle timer
        if (step.timer && step.timerLabel) {
            // Create a new timer for this step if needed
            timerContainer.classList.remove('hidden');
            
            if (activeTimer) {
                activeTimer.stop();
            }
            
            activeTimer = new Timer(
                step.timer,
                (seconds) => {
                    timerDisplay.textContent = activeTimer.formatTime(seconds);
                },
                () => {
                    // Play a sound or show notification when timer completes
                    if (Notification.permission === 'granted') {
                        new Notification('Timer Complete', {
                            body: `${step.timerLabel} for ${step.title} has finished!`,
                            icon: '/favicon.ico'
                        });
                    }
                    
                    addLogEntry(`Timer "${step.timerLabel}" completed for step "${step.title}"`);
                }
            );
            
            // Initialize timer display
            timerDisplay.textContent = activeTimer.formatTime(step.timer);
            
        } else {
            timerContainer.classList.add('hidden');
            if (activeTimer) {
                activeTimer.stop();
                activeTimer = null;
            }
        }
        
        // Update navigation buttons
        prevStepBtn.disabled = currentStepIndex === 0;
        completeStepBtn.disabled = false;
        
        // Add log entry for step start
        addLogEntry(`Started step ${currentStepIndex + 1}: ${step.title}`);
    }

    function completeCurrentStep() {
        const currentStep = recipeSteps[currentStepIndex];
        
        // Log completion
        addLogEntry(`Completed step ${currentStepIndex + 1}: ${currentStep.title}`, true);
        
        // Add to completed steps
        breadSession.completedSteps.push({
            stepId: currentStep.id,
            completedAt: new Date()
        });
        
        // Move to next step
        if (currentStepIndex < recipeSteps.length - 1) {
            loadStep(currentStepIndex + 1);
        } else {
            // All steps completed
            currentStepSection.classList.add('hidden');
            addLogEntry("Bread baking process completed! Enjoy your bread!", true);
        }
    }

    function exportJournal() {
        // Create a JSON file with all log entries
        const journalData = {
            sessionStart: breadSession.startTime,
            sessionEnd: new Date(),
            recipeName: "Tartine Basic Country Sourdough",
            completedSteps: breadSession.completedSteps,
            logs: breadSession.logs.map(log => ({
                timestamp: log.timestamp,
                message: log.message,
                isStepCompletion: log.isStepCompletion
            }))
        };
        
        // Convert to JSON string
        const jsonData = JSON.stringify(journalData, null, 2);
        
        // Create blob and download link
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Create temporary link and trigger download
        const a = document.createElement('a');
        const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `bread-journal-${dateStr}.json`;
        a.href = url;
        a.click();
        
        // Clean up
        URL.revokeObjectURL(url);
    }

    function startNewSession() {
        // Reset state
        currentStepIndex = 0;
        if (activeTimer) {
            activeTimer.stop();
        }
        activeTimer = null;
        
        // Initialize new session
        breadSession = {
            startTime: new Date(),
            currentStep: null,
            logs: [],
            completedSteps: []
        };
        
        // Clear log entries
        logEntries.innerHTML = '';
        
        // Add initial log entry
        addLogEntry('Started new bread baking session');
        
        // Show current step section
        currentStepSection.classList.remove('hidden');
        
        // Load first step
        loadStep(0);
        
        // Request notification permission if not already granted
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }

    // Event Listeners
    startSessionBtn.addEventListener('click', startNewSession);
    exportLogBtn.addEventListener('click', exportJournal);
    
    prevStepBtn.addEventListener('click', () => {
        if (currentStepIndex > 0) {
            loadStep(currentStepIndex - 1);
        }
    });
    
    completeStepBtn.addEventListener('click', completeCurrentStep);
    
    startTimerBtn.addEventListener('click', () => {
        if (activeTimer) {
            activeTimer.start();
            addLogEntry(`Started timer for "${recipeSteps[currentStepIndex].timerLabel}"`);
        }
    });
    
    pauseTimerBtn.addEventListener('click', () => {
        if (activeTimer && activeTimer.isRunning()) {
            activeTimer.pause();
            addLogEntry(`Paused timer for "${recipeSteps[currentStepIndex].timerLabel}"`);
        }
    });
    
    resetTimerBtn.addEventListener('click', () => {
        if (activeTimer) {
            activeTimer.reset();
            addLogEntry(`Reset timer for "${recipeSteps[currentStepIndex].timerLabel}"`);
        }
    });
}); 