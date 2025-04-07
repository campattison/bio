// Main application functionality
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the application
    initTabs();
    loadSettings();
    loadSampleData();
    requestNotificationPermission();
    
    // Add event listeners
    document.getElementById('start-new-session').addEventListener('click', showRecipeSelector);
    document.querySelector('.recipe-card[data-recipe-id="tartine"]').querySelector('button').addEventListener('click', showRecipeDetails);
    document.getElementById('add-journal-entry').addEventListener('click', showNewJournalEntry);
    document.getElementById('cancel-entry').addEventListener('click', hideNewJournalEntry);
    document.getElementById('journal-form').addEventListener('submit', handleJournalSubmit);
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    document.getElementById('update-weather-home').addEventListener('click', updateWeatherFromHome);
    
    // Sync home page inputs with settings
    document.getElementById('manual-temp').addEventListener('change', syncTempToHome);
    document.getElementById('manual-humidity').addEventListener('change', syncHumidityToHome);
    document.getElementById('manual-temp-home').addEventListener('change', syncTempToSettings);
    document.getElementById('manual-humidity-home').addEventListener('change', syncHumidityToSettings);
    
    // Setup rating stars
    setupRatingStars();
    
    // Setup file input preview
    setupPhotoPreview();
    
    // Check for active sessions when loading the page
    loadActiveSession();
    
    // Show completed sessions in the dashboard
    showCompletedSessionsInDashboard();
});

// Sync temperature from settings to home
function syncTempToHome() {
    const temp = document.getElementById('manual-temp').value;
    document.getElementById('manual-temp-home').value = temp;
}

// Sync humidity from settings to home
function syncHumidityToHome() {
    const humidity = document.getElementById('manual-humidity').value;
    document.getElementById('manual-humidity-home').value = humidity;
}

// Sync temperature from home to settings
function syncTempToSettings() {
    const temp = document.getElementById('manual-temp-home').value;
    document.getElementById('manual-temp').value = temp;
}

// Sync humidity from home to settings
function syncHumidityToSettings() {
    const humidity = document.getElementById('manual-humidity-home').value;
    document.getElementById('manual-humidity').value = humidity;
}

// Update weather from home page inputs
function updateWeatherFromHome() {
    // Sync values to settings
    syncTempToSettings();
    syncHumidityToSettings();
    
    // Update weather display
    updateWeather();
}

// Initialize tab navigation
function initTabs() {
    const tabs = document.querySelectorAll('nav li');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding content
            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
            
            // If switching to home tab, sync settings values to home inputs
            if (tabId === 'home') {
                syncTempToHome();
                syncHumidityToHome();
            }
        });
    });
}

// Load sample data (would be replaced with proper storage in a real app)
function loadSampleData() {
    // Load recipes
    loadSampleRecipe();
    
    // Initialize empty recent sessions list
    const recentSessionsList = document.getElementById('recent-sessions-list');
    recentSessionsList.innerHTML = '<p class="no-sessions">No recent bread sessions. Start a new session to begin baking.</p>';
    
    // Look for any active or completed sessions in localStorage
    checkForActiveSessions();
    showCompletedSessionsInDashboard();
}

// Check for any active sessions in localStorage
function checkForActiveSessions() {
    const savedSession = localStorage.getItem('activeSession');
    if (savedSession) {
        try {
            const session = JSON.parse(savedSession);
            // If there's a valid session, show it in the recent list
            addSessionToRecentList(session);
        } catch (e) {
            console.error('Error loading saved session:', e);
        }
    }
}

// Add a session to the recent sessions list
function addSessionToRecentList(session) {
    const recentSessionsList = document.getElementById('recent-sessions-list');
    
    // Clear "no sessions" message if it exists
    const noSessionsMsg = recentSessionsList.querySelector('.no-sessions');
    if (noSessionsMsg) {
        recentSessionsList.innerHTML = '';
    }
    
    // Create a new list item
    const listItem = document.createElement('li');
    listItem.setAttribute('data-session-id', session.id);
    
    // Calculate elapsed time
    const startTime = new Date(session.startTime);
    const timeAgo = getTimeAgo(startTime);
    
    // Get the current step name
    const currentStep = session.steps[session.currentStepIndex];
    
    listItem.innerHTML = `
        <strong>${session.recipeName}</strong>
        <div>Started: ${timeAgo}</div>
        <div>Current step: ${currentStep.name}</div>
    `;
    
    // Add click event
    listItem.addEventListener('click', () => showSessionDetails(session.id));
    
    // Add to the list
    recentSessionsList.appendChild(listItem);
}

// Get a human-readable time ago string
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin} minutes ago`;
    
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString();
}

// Load sample recipe
function loadSampleRecipe() {
    // The Tartine Basic Country Sourdough recipe
    window.recipes = {
        tartine: {
            id: 'tartine',
            name: 'Basic Country Sourdough',
            description: 'Tartine Bakery method for baking a basic country sourdough bread.',
            difficulty: 'Intermediate',
            totalTime: '24-30 hours',
            ingredients: [
                { name: 'Bread flour', amount: '900g' },
                { name: 'Whole wheat flour', amount: '100g' },
                { name: 'Water (80°F/27°C)', amount: '700g + 50g for salt' },
                { name: 'Leaven', amount: '200g' },
                { name: 'Salt', amount: '20g' }
            ],
            steps: [
                {
                    name: 'Preparing',
                    instructions: 'Prepare your workspace and gather all ingredients. If you haven\'t already, prepare your leaven the night before.',
                    duration: 0
                },
                {
                    name: 'Autolyse',
                    instructions: 'Mix 700g of 80°F water with 900g bread flour and 100g whole wheat flour until no dry flour remains. Cover and let rest for 25-40 minutes.',
                    duration: 1800 // 30 minutes in seconds
                },
                {
                    name: 'Mix',
                    instructions: 'Dissolve 20g salt in 50g water. Add salt water and 200g leaven to the dough and mix thoroughly by squeezing with your hand.',
                    duration: 600 // 10 minutes
                },
                {
                    name: 'Bulk Fermentation',
                    instructions: 'Perform a series of folds during the first few hours. Keep the dough at 78-82°F (25-28°C). Every 30 minutes, perform a stretch and fold.',
                    duration: 14400 // 4 hours
                },
                {
                    name: 'Shape',
                    instructions: 'Turn out the dough onto an unfloured surface. Divide into two equal pieces. Shape each piece into a round using the bench knife. Let the rounds rest for 20-30 minutes, then perform final shaping.',
                    duration: 1800 // 30 minutes
                },
                {
                    name: 'Final Proof',
                    instructions: 'Place shaped loaves in bannetons dusted with rice flour. Allow to proof at room temperature for 2-3 hours, or refrigerate overnight for 12-18 hours.',
                    duration: 43200 // 12 hours
                },
                {
                    name: 'Bake',
                    instructions: 'Preheat Dutch oven to 500°F (260°C). Place dough in the Dutch oven, score the top, cover, and reduce temperature to 450°F (230°C). Bake covered for 20 minutes, then uncovered for 20-25 minutes until dark golden brown.',
                    duration: 2700 // 45 minutes
                },
                {
                    name: 'Complete',
                    instructions: 'Your bread is complete! Allow to cool completely on a wire rack before slicing.',
                    duration: 0
                }
            ],
            optimalTemperature: 78, // °F
            optimalHumidity: 65, // %
            adjustForConditions: true
        }
    };
}

// Show recipe selector for new session
function showRecipeSelector() {
    // Create and show a modal with recipe options
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Select a Recipe</h3>
                <span class="close-modal">&times;</span>
            </div>
            <div class="modal-body">
                <div class="recipe-options">
                    ${Object.values(window.recipes).map(recipe => `
                        <div class="recipe-option" data-recipe-id="${recipe.id}">
                            <h4>${recipe.name}</h4>
                            <p>${recipe.description}</p>
                            <div class="recipe-metadata">
                                <span><i class="fas fa-clock"></i> ${recipe.totalTime}</span>
                                <span><i class="fas fa-signal"></i> ${recipe.difficulty}</span>
                            </div>
                            <button class="btn-primary select-recipe" data-recipe-id="${recipe.id}">Select</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners for modal
    modal.querySelector('.close-modal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Add event listeners for recipe selection
    modal.querySelectorAll('.select-recipe').forEach(button => {
        button.addEventListener('click', (e) => {
            const recipeId = e.target.getAttribute('data-recipe-id');
            document.body.removeChild(modal);
            startNewSession(recipeId);
        });
    });
    
    // Show the modal
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);
}

// Start a new bread session
function startNewSession(recipeId) {
    const recipe = window.recipes[recipeId];
    if (!recipe) {
        console.error("Recipe not found:", recipeId);
        return;
    }
    
    // Create a new session object
    const session = {
        id: 'session_' + Date.now(),
        recipeId: recipeId,
        recipeName: recipe.name,
        startTime: new Date(),
        currentStep: 'Preparing',
        currentStepIndex: 0, // Start at first step
        currentStepStartTime: new Date(),
        currentStepEndTime: null,
        isComplete: false,
        completedFolds: 0,
        timeline: [
            {
                step: 'Preparing',
                startTime: new Date(),
                endTime: null,
                status: 'active'
            }
        ]
    };
    
    console.log("Creating new session:", session);
    
    // Store the session globally
    window.currentSession = session;
    
    // Save to localStorage for persistence
    try {
        const sessions = JSON.parse(localStorage.getItem('cindysBreadSessions') || '[]');
        sessions.push(session);
        localStorage.setItem('cindysBreadSessions', JSON.stringify(sessions));
    } catch (e) {
        console.error("Error saving session to localStorage:", e);
    }
    
    // Switch to sessions tab and show the session details
    document.querySelector('nav li[data-tab="sessions"]').click();
    
    // Hide the "no sessions" message
    const noSessionsMsg = document.querySelector('#active-sessions .no-sessions');
    if (noSessionsMsg) noSessionsMsg.style.display = 'none';
    
    // Show session details
    showSessionDetails(session.id);
}

// Show recipe details
function showRecipeDetails() {
    const recipe = window.recipes.tartine;
    const recipeDetail = document.getElementById('recipe-detail');
    
    let ingredientsList = '';
    recipe.ingredients.forEach(ingredient => {
        ingredientsList += `<li>${ingredient.amount} ${ingredient.name}</li>`;
    });
    
    let stepsList = '';
    recipe.steps.forEach(step => {
        const duration = step.duration > 0 ? formatDuration(step.duration) : 'Variable';
        stepsList += `
            <div class="recipe-step">
                <h4>${step.name}</h4>
                <div class="step-time">${duration}</div>
                <p>${step.instructions}</p>
            </div>
        `;
    });
    
    recipeDetail.innerHTML = `
        <h3>${recipe.name}</h3>
        <p>${recipe.description}</p>
        
        <div class="recipe-metadata">
            <span><i class="fas fa-clock"></i> Total time: ${recipe.totalTime}</span>
            <span><i class="fas fa-signal"></i> Difficulty: ${recipe.difficulty}</span>
        </div>
        
        <h4>Ingredients</h4>
        <ul class="ingredients-list">
            ${ingredientsList}
        </ul>
        
        <h4>Method</h4>
        <div class="steps-list">
            ${stepsList}
        </div>
        
        <div class="recipe-actions">
            <button id="start-session-from-recipe" class="btn-primary">Start Bread Session</button>
        </div>
    `;
    
    recipeDetail.classList.remove('hidden');
    document.getElementById('start-session-from-recipe').addEventListener('click', () => startNewSession('tartine'));
}

// Show session details
function showSessionDetails(sessionId) {
    // Find the session by ID
    let session;
    
    if (window.currentSession && window.currentSession.id === sessionId) {
        session = window.currentSession;
    } else {
        try {
            const sessions = JSON.parse(localStorage.getItem('cindysBreadSessions') || '[]');
            session = sessions.find(s => s.id === sessionId);
        } catch (e) {
            console.error('Error loading session:', e);
        }
    }
    
    if (!session) {
        alert('Session not found');
        return;
    }
    
    // Store as current session
    window.currentSession = session;
    
    // Get the recipe
    const recipe = window.recipes[session.recipeId];
    if (!recipe) {
        alert('Recipe not found');
        return;
    }
    
    // Update UI
    document.getElementById('session-recipe-name').textContent = recipe.name;
    document.getElementById('session-start-time').textContent = `Started: ${formatDate(session.startTime, true)}`;
    
    // Get the current step
    const currentStepName = session.currentStep || recipe.steps[0].name;
    const currentStepIndex = recipe.steps.findIndex(step => step.name === currentStepName);
    
    if (currentStepIndex === -1) {
        alert('Current step not found');
        return;
    }
    
    const currentStep = recipe.steps[currentStepIndex];
    document.getElementById('current-step-name').textContent = currentStep.name;
    document.getElementById('step-number').textContent = `Step ${currentStepIndex + 1} of ${recipe.steps.length}`;
    
    // Update step instructions
    document.getElementById('step-instructions').innerHTML = `<p>${currentStep.instructions}</p>`;
    
    // Show technique tips
    const tipContent = document.querySelector('.tip-content');
    tipContent.innerHTML = getTechniqueInfo(currentStep.name);
    
    // Show visual cues
    const visualCuesList = document.getElementById('visual-cues-list');
    visualCuesList.innerHTML = getVisualCues(currentStep.name);
    
    // Update progress
    const progress = (currentStepIndex / (recipe.steps.length - 1)) * 100;
    document.getElementById('overall-progress').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = `${Math.round(progress)}% Complete`;
    
    // Show step-specific UI elements
    showStepSpecificUI(currentStep.name, session);
    
    // Update navigation buttons
    updateNavigationButtons(currentStep.name, recipe.steps);
    
    // Update the timeline
    if (session.timeline) {
        populateTimeline(session.timeline, currentStepName);
    } else {
        // Initialize timeline if it doesn't exist
        session.timeline = [{
            step: currentStepName,
            startTime: session.currentStepStartTime || new Date(),
            endTime: session.currentStepEndTime || null,
            status: 'active'
        }];
        populateTimeline(session.timeline, currentStepName);
    }
    
    // Update timer
    if (session.currentStepEndTime) {
        const endTime = new Date(session.currentStepEndTime);
        document.getElementById('step-end-time').textContent = endTime.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Start timer
        updateTimer(endTime);
    } else {
        document.getElementById('time-remaining').textContent = '00:00:00';
        document.getElementById('step-end-time').textContent = '--:--';
    }
    
    document.getElementById('step-start-time').textContent = new Date(session.currentStepStartTime || Date.now()).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Add event listeners
    addSessionEventListeners();
    
    // Show the session detail and hide the sessions list
    document.getElementById('session-detail').classList.remove('hidden');
    document.getElementById('active-sessions').style.display = 'none';
}

// Update the session navigation buttons based on current step
function updateNavigationButtons(currentStep, recipeSteps) {
    const prevButton = document.getElementById('prev-step');
    const nextButton = document.getElementById('next-step');
    
    // If we're on the first step, disable the previous button
    if (recipeSteps.findIndex(step => step.name === currentStep) === 0) {
        prevButton.disabled = true;
        prevButton.classList.add('btn-disabled');
    } else {
        prevButton.disabled = false;
        prevButton.classList.remove('btn-disabled');
    }
    
    // If we're on the Complete step, change Next button to "Create Journal Entry"
    if (currentStep === 'Complete') {
        nextButton.textContent = 'Create Journal Entry';
        nextButton.classList.add('journal-redirect');
    } else {
        nextButton.textContent = 'Next Step';
        nextButton.classList.remove('journal-redirect');
    }
}

// Add session event listeners
function addSessionEventListeners() {
    document.getElementById('timer-start-pause').addEventListener('click', toggleTimer);
    document.getElementById('timer-reset').addEventListener('click', resetTimer);
    document.getElementById('prev-step').addEventListener('click', goToPreviousStep);
    
    const nextButton = document.getElementById('next-step');
    nextButton.addEventListener('click', function() {
        // If this is the Complete step, go directly to journal
        if (this.classList.contains('journal-redirect')) {
            // Mark the session as complete
            handleSessionCompletion(true);
        } else {
            advanceToNextStep();
        }
    });
    
    document.getElementById('reduce-time').addEventListener('click', () => adjustTime(-15));
    document.getElementById('add-time').addEventListener('click', () => adjustTime(15));
    
    // Add event listeners for fold buttons if visible
    const foldButtons = document.querySelectorAll('.fold-btn');
    if (foldButtons.length > 0) {
        foldButtons.forEach(btn => {
            btn.addEventListener('click', handleFoldButtonClick);
        });
    }
}

// Show step-specific UI elements
function showStepSpecificUI(stepName, session) {
    // Hide all step-specific elements first
    document.getElementById('stretch-fold-tracker').classList.add('hidden');
    
    // Show elements based on the current step
    if (stepName === 'Bulk Fermentation') {
        // Show stretch and fold tracker
        document.getElementById('stretch-fold-tracker').classList.remove('hidden');
        
        // Mark completed folds
        const foldButtons = document.querySelectorAll('.fold-btn');
        foldButtons.forEach(btn => {
            const foldNumber = parseInt(btn.getAttribute('data-fold'));
            if (foldNumber <= session.completedFolds) {
                btn.classList.add('completed');
            } else {
                btn.classList.remove('completed');
            }
        });
        
        // Set up next fold timer if not all folds are completed
        if (session.completedFolds < 6) {
            const nextFoldNumber = session.completedFolds + 1;
            document.getElementById('next-fold-time').parentElement.classList.remove('hidden');
            
            // If we don't have a specific end time for the next fold, set one 30 minutes from now
            if (!session.nextFoldEndTime || new Date(session.nextFoldEndTime) < new Date()) {
                const now = new Date();
                session.nextFoldEndTime = new Date(now.getTime() + (30 * 60 * 1000)); // 30 minutes
                saveSession(session);
            }
            
            // Set the initial display
            updateNextFoldTimer(session.nextFoldEndTime);
            
            // Set interval to update the timer every second
            clearInterval(window.foldTimerInterval);
            window.foldTimerInterval = setInterval(() => {
                if (window.currentSession && window.currentSession.nextFoldEndTime) {
                    updateNextFoldTimer(window.currentSession.nextFoldEndTime);
                }
            }, 1000);
            
            // For debugging
            console.log('Fold timer started:', session.nextFoldEndTime);
        } else {
            // All folds completed
            document.getElementById('next-fold-time').parentElement.classList.add('hidden');
            clearInterval(window.foldTimerInterval);
        }
    } else {
        // If we're not in bulk fermentation, clear any fold timers
        clearInterval(window.foldTimerInterval);
    }
}

// Get technique info based on step
function getTechniqueInfo(stepName) {
    switch (stepName) {
        case 'Preparing':
            return "Make sure your starter is active and bubbly. It should have at least doubled in size since last feeding.";
        case 'Autolyse':
            return "The autolyse develops the gluten without kneading. Ensure all flour is hydrated, but don't overmix at this stage.";
        case 'Mix':
            return "When adding the leaven and salt, use a pinching motion to thoroughly incorporate them into the dough.";
        case 'Bulk Fermentation':
            return "For the stretch and folds, wet your hands, grab one side of the dough, stretch it up and fold to the center. Rotate the bowl 90° and repeat 3 more times to complete one fold cycle.";
        case 'Shape':
            return "The pre-shape creates surface tension. For the final shape, be gentle but decisive to maintain bubbles while creating structure.";
        case 'Final Proof':
            return "The banneton will help the dough hold its shape and wick away moisture. Dust it well with rice flour to prevent sticking.";
        case 'Bake':
            return "Score the loaf at a 45° angle, about ¼-inch deep. This controls how the loaf expands during baking.";
        case 'Complete':
            return "Let the loaf cool completely (at least 2 hours) before slicing to allow the crumb to set properly.";
        default:
            return "Follow the recipe instructions carefully for best results.";
    }
}

// Get visual cues based on step
function getVisualCues(stepName) {
    switch (stepName) {
        case 'Preparing':
            return [
                "Starter should be doubled in size with a domed top",
                "When dropped in water, the starter should float",
                "Smell should be pleasantly sour but not overly acidic"
            ];
        case 'Autolyse':
            return [
                "Dough should be fully hydrated with no dry spots",
                "Texture will be shaggy and slightly sticky",
                "Gluten development will be minimal at this stage"
            ];
        case 'Mix':
            return [
                "Salt should be fully dissolved",
                "Dough temperature should be around 78°F (25°C)",
                "Texture will be sticky but starting to develop some strength"
            ];
        case 'Bulk Fermentation':
            return [
                "Dough should increase in volume by 20-30%",
                "Surface will become smoother after each fold",
                "Bubbles will be visible on the sides and top",
                "Dough will feel elastic and jiggly when the bowl is gently shaken"
            ];
        case 'Shape':
            return [
                "Dough should hold its shape for a few seconds when turned out",
                "After pre-shaping, the dough will gradually relax",
                "Final shape should hold without spreading too much",
                "Surface should be taut but not torn"
            ];
        case 'Final Proof':
            return [
                "Dough will increase in size by about 50%",
                "When poked, the indentation should slowly spring back (poke test)",
                "Surface should appear slightly domed"
            ];
        case 'Bake':
            return [
                "Loaf will rise dramatically in the first 10-15 minutes (oven spring)",
                "Crust will begin to color after removing lid",
                "Final crust should be deep amber to dark brown",
                "Listen for a crackling sound when removed from oven"
            ];
        case 'Complete':
            return [
                "Bread should sound hollow when tapped on the bottom",
                "Crust should be crisp and well-colored",
                "Wait until completely cool before slicing"
            ];
        default:
            return ["Follow the recipe instructions carefully"];
    }
}

// Populate the timeline
function populateTimeline(timeline, currentStepName) {
    const timelineElement = document.getElementById('session-timeline');
    timelineElement.innerHTML = '';
    
    timeline.forEach(item => {
        const timelineItem = document.createElement('div');
        timelineItem.className = `timeline-item ${item.status}`;
        
        const point = document.createElement('div');
        point.className = `timeline-point ${item.status}`;
        
        const content = document.createElement('div');
        content.className = 'timeline-content';
        
        const title = document.createElement('h5');
        title.textContent = item.step;
        
        const time = document.createElement('div');
        time.className = 'timeline-time';
        
        if (item.status === 'completed') {
            time.textContent = `Completed: ${formatDate(item.endTime, true)}`;
        } else if (item.status === 'active') {
            time.textContent = `Started: ${formatDate(item.startTime, true)} - In progress`;
        } else {
            time.textContent = `Scheduled: ${formatDate(item.startTime, true)}`;
        }
        
        content.appendChild(title);
        content.appendChild(time);
        
        timelineItem.appendChild(point);
        timelineItem.appendChild(content);
        
        timelineElement.appendChild(timelineItem);
    });
}

// Handle fold button click
function handleFoldButtonClick(e) {
    if (!window.currentSession) return;
    
    const foldNumber = parseInt(e.target.getAttribute('data-fold'));
    
    // Can only complete folds sequentially
    if (foldNumber !== window.currentSession.completedFolds + 1) {
        if (foldNumber <= window.currentSession.completedFolds) {
            alert(`Fold ${foldNumber} has already been completed.`);
        } else {
            alert(`Please complete fold ${window.currentSession.completedFolds + 1} first.`);
        }
        return;
    }
    
    // Mark this fold as completed
    window.currentSession.completedFolds = foldNumber;
    e.target.classList.add('completed');
    
    // If we've completed a fold, reset the timer for the next one
    if (foldNumber < 6) {
        const now = new Date();
        window.currentSession.nextFoldEndTime = new Date(now.getTime() + (30 * 60 * 1000)); // 30 minutes
        updateNextFoldTimer(window.currentSession.nextFoldEndTime);
    } else {
        // All folds completed
        document.getElementById('next-fold-time').parentElement.classList.add('hidden');
        clearInterval(window.foldTimerInterval);
    }
    
    // Save the updated session
    saveSession(window.currentSession);
}

// Update next fold timer
function updateNextFoldTimer(endTime) {
    if (!endTime) return;
    
    // Handle string dates (from localStorage)
    if (typeof endTime === 'string') {
        endTime = new Date(endTime);
    }
    
    const now = new Date();
    const timeRemaining = endTime - now;
    
    if (timeRemaining <= 0) {
        document.getElementById('next-fold-time').textContent = 'Ready for next fold!';
        
        // Send notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Fold Timer Complete', {
                body: 'Time to perform the next stretch and fold!'
            });
        }
        
        return;
    }
    
    // Format the time remaining
    const minutes = Math.floor(timeRemaining / 60000);
    const seconds = Math.floor((timeRemaining % 60000) / 1000);
    document.getElementById('next-fold-time').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Adjust timer time
function adjustTime(minutes) {
    if (!window.currentSession || !window.currentSession.currentStepEndTime) return;
    
    // Add or subtract minutes from the end time
    const newEndTime = new Date(window.currentSession.currentStepEndTime.getTime() + (minutes * 60 * 1000));
    window.currentSession.currentStepEndTime = newEndTime;
    
    // Update UI
    document.getElementById('step-end-time').textContent = new Date(newEndTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Reset timer with new end time
    updateTimer(newEndTime);
}

// Go to previous step
function goToPreviousStep() {
    if (!window.currentSession) return;
    
    const recipe = window.recipes[window.currentSession.recipeId];
    if (!recipe) return;
    
    const currentStepIndex = recipe.steps.findIndex(step => step.name === window.currentSession.currentStep);
    if (currentStepIndex <= 0) {
        alert('This is the first step!');
        return;
    }
    
    const prevStep = recipe.steps[currentStepIndex - 1];
    
    if (confirm(`Are you sure you want to go back to the ${prevStep.name} step?`)) {
        window.currentSession.currentStep = prevStep.name;
        window.currentSession.currentStepStartTime = new Date();
        
        if (prevStep.duration > 0) {
            window.currentSession.currentStepEndTime = new Date(Date.now() + (prevStep.duration * 1000));
        } else {
            window.currentSession.currentStepEndTime = null;
        }
        
        // Update timeline
        window.currentSession.timeline = window.currentSession.timeline.map(item => {
            if (item.step === prevStep.name) {
                return {
                    ...item,
                    startTime: new Date(),
                    endTime: prevStep.duration > 0 ? new Date(Date.now() + (prevStep.duration * 1000)) : null,
                    status: 'active'
                };
            } else if (item.step === window.currentSession.currentStep) {
                return {
                    ...item,
                    status: 'pending'
                };
            }
            return item;
        });
        
        // Refresh the session display
        showSessionDetails(window.currentSession.id);
    }
}

// Advance to next step
function advanceToNextStep() {
    if (!window.currentSession) return;
    
    const recipe = window.recipes[window.currentSession.recipeId];
    if (!recipe) return;
    
    const currentStepIndex = recipe.steps.findIndex(step => step.name === window.currentSession.currentStep);
    if (currentStepIndex === -1 || currentStepIndex >= recipe.steps.length - 1) {
        alert('This is the final step!');
        return;
    }
    
    const nextStep = recipe.steps[currentStepIndex + 1];
    window.currentSession.currentStep = nextStep.name;
    window.currentSession.currentStepStartTime = new Date();
    
    if (nextStep.duration > 0) {
        window.currentSession.currentStepEndTime = new Date(Date.now() + (nextStep.duration * 1000));
    } else {
        window.currentSession.currentStepEndTime = null;
    }
    
    // Update timeline
    const currentTimeline = window.currentSession.timeline || [];
    const currentStepEntry = currentTimeline.find(item => item.step === recipe.steps[currentStepIndex].name);
    
    if (currentStepEntry) {
        currentStepEntry.status = 'completed';
        currentStepEntry.endTime = new Date();
    }
    
    // Add next step to timeline if it doesn't exist
    const nextStepEntry = currentTimeline.find(item => item.step === nextStep.name);
    if (!nextStepEntry) {
        currentTimeline.push({
            step: nextStep.name,
            startTime: new Date(),
            endTime: nextStep.duration > 0 ? new Date(Date.now() + (nextStep.duration * 1000)) : null,
            status: 'active'
        });
    } else {
        nextStepEntry.status = 'active';
        nextStepEntry.startTime = new Date();
        nextStepEntry.endTime = nextStep.duration > 0 ? new Date(Date.now() + (nextStep.duration * 1000)) : null;
    }
    
    window.currentSession.timeline = currentTimeline;
    
    // Check if this is the "Complete" step and handle session completion
    if (nextStep.name === 'Complete') {
        handleSessionCompletion();
    }
    
    // Refresh the session display
    showSessionDetails(window.currentSession.id);
}

// Handle completion of a bread session
function handleSessionCompletion(goToJournal = false) {
    // Mark the session as complete
    window.currentSession.isComplete = true;
    window.currentSession.completionTime = new Date();
    
    // Ensure all timeline steps are marked completed
    if (window.currentSession.timeline) {
        window.currentSession.timeline.forEach(item => {
            if (item.status !== 'completed' && item.step !== 'Complete') {
                item.status = 'completed';
                item.endTime = item.endTime || new Date();
            }
        });
    }
    
    // Save the completed session
    saveSession(window.currentSession);
    
    // If goToJournal is true, go directly to journal entry form
    if (goToJournal) {
        createJournalEntryFromSession(window.currentSession);
    } else {
        // Otherwise, ask if user wants to create a journal entry
        setTimeout(() => {
            if (confirm('Congratulations on completing your bread! Would you like to create a journal entry to record your results?')) {
                createJournalEntryFromSession(window.currentSession);
            }
        }, 1000);
    }
}

// Create a journal entry from a completed session
function createJournalEntryFromSession(session) {
    // Switch to the journal tab
    document.querySelector('nav li[data-tab="journal"]').click();
    
    // Show the new journal entry form
    document.getElementById('add-journal-entry').click();
    
    // Pre-fill the form with session data
    document.getElementById('entry-title').value = `${session.recipeName} Bread`;
    document.getElementById('entry-recipe').value = session.recipeId;
    
    // Pre-select this session in the session selector if it exists
    const sessionSelector = document.getElementById('session-selector');
    if (sessionSelector) {
        sessionSelector.value = session.id;
        
        // Trigger the change event to update the preview
        const event = new Event('change');
        sessionSelector.dispatchEvent(event);
    }
}

// Show completed sessions in the dashboard recent sessions list
function showCompletedSessionsInDashboard() {
    try {
        const sessions = JSON.parse(localStorage.getItem('cindysBreadSessions') || '[]');
        const recentCompletedSessions = sessions
            .filter(s => s.isComplete)
            .sort((a, b) => new Date(b.completionTime || b.startTime) - new Date(a.completionTime || a.startTime))
            .slice(0, 3); // Show only the 3 most recent
            
        const recentSessionsList = document.getElementById('recent-sessions-list');
        
        // If no completed sessions
        if (recentCompletedSessions.length === 0) {
            if (!recentSessionsList.querySelector('.no-sessions')) {
                recentSessionsList.innerHTML = '<p class="no-sessions">No recent bread sessions. Start a new session to begin baking.</p>';
            }
            return;
        }
        
        // Remove the "no sessions" message if it exists
        const noSessionsMsg = recentSessionsList.querySelector('.no-sessions');
        if (noSessionsMsg) {
            recentSessionsList.innerHTML = '';
        }
        
        // Add completed sessions to the list
        recentCompletedSessions.forEach(session => {
            // Check if this session is already in the list
            const existingItem = recentSessionsList.querySelector(`li[data-session-id="${session.id}"]`);
            if (!existingItem) {
                addSessionToRecentList(session);
            }
        });
        
    } catch (e) {
        console.error('Error showing completed sessions:', e);
    }
}

// Format a date for display with option for time
function formatDate(date, includeTime = false) {
    // Check if it's a string and convert to date
    if (typeof date === 'string') {
        date = new Date(date);
    }
    
    if (includeTime) {
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    } else {
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }).format(date);
    }
}

// Show journal details
function showJournalDetails(entryId) {
    // In a real app, would fetch this from storage
    const entry = {
        id: 'journal1',
        title: 'First Successful Boule',
        date: new Date(2023, 5, 15), // June 15, 2023
        recipe: 'Basic Country Sourdough',
        rating: 4,
        notes: 'My first really successful loaf! The crust was crispy and the interior had a nice open crumb. I think the key was maintaining proper dough temperature during bulk fermentation and proper shaping technique.',
        photo: 'img/sample-bread.jpg',
        environmentalData: {
            temperature: 75,
            humidity: 58
        }
    };
    
    const journalDetail = document.getElementById('journal-detail');
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        stars += i <= entry.rating ? '★' : '☆';
    }
    
    journalDetail.innerHTML = `
        <div class="journal-entry-detail">
            <div class="entry-header">
                <h3>${entry.title}</h3>
                <div class="entry-date">${formatDate(entry.date)}</div>
            </div>
            
            <div class="entry-rating">${stars}</div>
            
            <div class="entry-recipe">Recipe: ${entry.recipe}</div>
            
            <div class="entry-environmental">
                <p>Temperature: ${entry.environmentalData.temperature}°F</p>
                <p>Humidity: ${entry.environmentalData.humidity}%</p>
            </div>
            
            <div class="entry-photo">
                <!-- Would display the photo here in a real app -->
                <div class="photo-placeholder">Photo Placeholder</div>
            </div>
            
            <div class="entry-notes">
                <h4>Notes & Lessons Learned</h4>
                <p>${entry.notes}</p>
            </div>
            
            <button id="back-to-journal" class="btn-secondary">Back to Journal</button>
        </div>
    `;
    
    journalDetail.classList.remove('hidden');
    document.getElementById('journal-entries').style.display = 'none';
    document.getElementById('add-journal-entry').style.display = 'none';
    
    document.getElementById('back-to-journal').addEventListener('click', () => {
        journalDetail.classList.add('hidden');
        document.getElementById('journal-entries').style.display = 'grid';
        document.getElementById('add-journal-entry').style.display = 'block';
    });
}

// Show new journal entry form
function showNewJournalEntry() {
    document.getElementById('new-journal-entry').classList.remove('hidden');
    document.getElementById('journal-entries').style.display = 'none';
    document.getElementById('add-journal-entry').style.display = 'none';
    
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('entry-date').value = today;
}

// Hide new journal entry form
function hideNewJournalEntry() {
    document.getElementById('new-journal-entry').classList.add('hidden');
    document.getElementById('journal-entries').style.display = 'grid';
    document.getElementById('add-journal-entry').style.display = 'block';
}

// Handle journal form submission
function handleJournalSubmit(e) {
    e.preventDefault();
    
    // Forward to the saveJournalEntry function in journal.js
    if (typeof saveJournalEntry === 'function') {
        saveJournalEntry();
    } else {
        console.error('saveJournalEntry function not found');
        alert('An error occurred while saving your journal entry. Please try again.');
    }
}

// Setup rating stars
function setupRatingStars() {
    const stars = document.querySelectorAll('.star');
    const ratingInput = document.getElementById('entry-rating');
    
    stars.forEach(star => {
        star.addEventListener('click', () => {
            const rating = parseInt(star.getAttribute('data-rating'));
            ratingInput.value = rating;
            
            // Update star display
            stars.forEach(s => {
                const sRating = parseInt(s.getAttribute('data-rating'));
                if (sRating <= rating) {
                    s.classList.add('active');
                } else {
                    s.classList.remove('active');
                }
            });
        });
    });
}

// Setup photo preview
function setupPhotoPreview() {
    const photoInput = document.getElementById('entry-photo');
    const photoPreview = document.getElementById('photo-preview');
    
    photoInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            const reader = new FileReader();
            
            reader.onload = function(e) {
                photoPreview.style.backgroundImage = `url(${e.target.result})`;
            }
            
            reader.readAsDataURL(this.files[0]);
        }
    });
}

// Save settings to localStorage
function saveSettings() {
    const settings = {
        location: document.getElementById('location').value,
        manualTemp: parseFloat(document.getElementById('manual-temp').value),
        manualHumidity: parseFloat(document.getElementById('manual-humidity').value),
        enableAutoAdjust: document.getElementById('enable-auto-adjust').checked,
        enableNotifications: document.getElementById('enable-notifications').checked,
        soundAlerts: document.getElementById('sound-alerts').checked
    };
    
    // Save to localStorage
    localStorage.setItem('cindysBreadSettings', JSON.stringify(settings));
    console.log('Settings saved:', settings);
    
    // Show confirmation
    alert('Settings saved successfully!');
    
    // Apply settings immediately
    updateWeather();
    
    // Sync settings to home page
    syncTempToHome();
    syncHumidityToHome();
}

// Load settings from localStorage
function loadSettings() {
    let settings;
    try {
        settings = JSON.parse(localStorage.getItem('cindysBreadSettings'));
    } catch (e) {
        console.error('Error loading settings:', e);
    }
    
    // Default settings
    if (!settings) {
        settings = {
            location: 'Nashville, TN',
            manualTemp: 72,
            manualHumidity: 50,
            enableAutoAdjust: true,
            enableNotifications: true,
            soundAlerts: true
        };
        
        // Save default settings
        localStorage.setItem('cindysBreadSettings', JSON.stringify(settings));
    }
    
    // Apply settings to UI
    document.getElementById('location').value = settings.location;
    document.getElementById('manual-temp').value = settings.manualTemp;
    document.getElementById('manual-humidity').value = settings.manualHumidity;
    document.getElementById('enable-auto-adjust').checked = settings.enableAutoAdjust;
    document.getElementById('enable-notifications').checked = settings.enableNotifications;
    document.getElementById('sound-alerts').checked = settings.soundAlerts;
    
    // Apply to home page inputs
    document.getElementById('manual-temp-home').value = settings.manualTemp;
    document.getElementById('manual-humidity-home').value = settings.manualHumidity;
    document.getElementById('weather-location').textContent = settings.location;
    
    // Store settings globally
    window.appSettings = settings;
}

// Request notification permission
function requestNotificationPermission() {
    if ('Notification' in window) {
        Notification.requestPermission();
    }
}

// Get current environmental data
function getCurrentEnvironmentalData() {
    // Get the current weather data from the input fields
    const temperature = parseFloat(document.getElementById('manual-temp-home').value);
    const humidity = parseFloat(document.getElementById('manual-humidity-home').value);
    
    return {
        temperature: temperature,
        humidity: humidity
    };
}

// Calculate recipe adjustments based on environmental conditions
function calculateAdjustedValues(recipe) {
    const env = getCurrentEnvironmentalData();
    
    // Simple adjustment algorithm
    const tempDiff = env.temperature - recipe.optimalTemperature;
    const humidityDiff = env.humidity - recipe.optimalHumidity;
    
    // Adjust water based on humidity
    let waterAdjustment = 0;
    if (humidityDiff < 0) {
        // Drier environment, add more water
        waterAdjustment = Math.abs(humidityDiff) * 0.5;
    } else if (humidityDiff > 0) {
        // More humid, reduce water
        waterAdjustment = -humidityDiff * 0.3;
    }
    
    // Adjust fermentation time based on temperature
    let timeAdjustment = 0;
    if (tempDiff < 0) {
        // Cooler environment, extend fermentation
        timeAdjustment = Math.abs(tempDiff) * 15; // 15 minutes per degree
    } else if (tempDiff > 0) {
        // Warmer environment, reduce fermentation
        timeAdjustment = -tempDiff * 10; // 10 minutes per degree
    }
    
    // Format the adjusted values
    const bulkTime = recipe.steps.find(step => step.name === 'Bulk Fermentation').duration;
    const proofTime = recipe.steps.find(step => step.name === 'Final Proof').duration;
    
    return {
        water: `${Math.round(700 + waterAdjustment)}g`,
        bulkTime: formatDuration(bulkTime + (timeAdjustment * 60)),
        proofTime: formatDuration(proofTime + (timeAdjustment * 60 * 2))
    };
}

// Update timer display
function updateTimer(endTime) {
    if (!endTime) {
        console.warn("No end time provided to updateTimer");
        return;
    }

    const now = new Date();
    const timeRemaining = endTime - now;
    
    if (timeRemaining <= 0) {
        document.getElementById('time-remaining').textContent = 'Ready for next step';
        clearInterval(window.timerInterval);
        
        // Send notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Bread Timer Complete', {
                body: 'Your current bread step is complete. Time to move to the next step!'
            });
        }
        
        return;
    }
    
    document.getElementById('time-remaining').textContent = formatTimeRemaining(timeRemaining);
}

// Toggle timer play/pause
function toggleTimer() {
    const button = document.getElementById('timer-start-pause');
    const isPlaying = button.innerHTML.includes('fa-pause');
    
    if (isPlaying) {
        // Pause the timer
        button.innerHTML = '<i class="fas fa-play"></i>';
        clearInterval(window.timerInterval);
    } else {
        // Start the timer
        button.innerHTML = '<i class="fas fa-pause"></i>';
        
        if (window.currentSession && window.currentSession.currentStepEndTime) {
            // Restart the timer interval
            updateTimer(window.currentSession.currentStepEndTime);
            window.timerInterval = setInterval(() => {
                updateTimer(window.currentSession.currentStepEndTime);
            }, 1000);
        }
    }
}

// Reset timer
function resetTimer() {
    if (!window.currentSession || !window.currentSession.currentStepEndTime) return;
    
    // Reset the timer to the original duration
    const recipe = window.recipes[window.currentSession.recipeId];
    const step = recipe.steps.find(s => s.name === window.currentSession.currentStep);
    
    if (step && step.duration > 0) {
        // Set the end time to now + duration
        window.currentSession.currentStepStartTime = new Date();
        window.currentSession.currentStepEndTime = new Date(Date.now() + (step.duration * 1000));
        
        // Update the UI
        document.getElementById('step-start-time').textContent = 
            window.currentSession.currentStepStartTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        document.getElementById('step-end-time').textContent = 
            window.currentSession.currentStepEndTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        // Reset and restart the timer
        updateTimer(window.currentSession.currentStepEndTime);
        
        // Make sure timer is running
        const button = document.getElementById('timer-start-pause');
        button.innerHTML = '<i class="fas fa-pause"></i>';
        
        clearInterval(window.timerInterval);
        window.timerInterval = setInterval(() => {
            updateTimer(window.currentSession.currentStepEndTime);
        }, 1000);
    }
}

// Helper function to format time remaining
function formatTimeRemaining(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / 1000 / 60) % 60);
    const hours = Math.floor(ms / 1000 / 60 / 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Format a duration in seconds to a readable string
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes > 0 ? minutes + 'm' : ''}`;
    } else {
        return `${minutes}m`;
    }
}

// Update weather display
function updateWeather() {
    // Implementation of updateWeather function
}

// Save session to localStorage
function saveSession(session) {
    try {
        const sessions = JSON.parse(localStorage.getItem('cindysBreadSessions') || '[]');
        const index = sessions.findIndex(s => s.id === session.id);
        
        if (index !== -1) {
            sessions[index] = session;
        } else {
            sessions.push(session);
        }
        
        localStorage.setItem('cindysBreadSessions', JSON.stringify(sessions));
    } catch (e) {
        console.error("Error saving session to localStorage:", e);
    }
}

// Load active session
function loadActiveSession() {
    try {
        // Check if we have any sessions in localStorage
        const sessions = JSON.parse(localStorage.getItem('cindysBreadSessions') || '[]');
        
        // Find the most recent active session that's not in the Complete step
        const activeSession = sessions.find(s => 
            !s.isComplete && 
            (!s.currentStep || s.currentStep !== 'Complete')
        );
        
        if (activeSession) {
            // Load this session
            window.currentSession = activeSession;
            
            // If we're already on the sessions tab, show the details
            if (document.getElementById('sessions').classList.contains('active')) {
                showSessionDetails(activeSession.id);
            }
        }
    } catch (e) {
        console.error("Error loading active session:", e);
    }
} 