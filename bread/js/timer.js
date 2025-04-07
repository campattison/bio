// Timer functionality
let timerInterval = null;
let timerEndTime = null;
let timerPaused = false;
let timerPauseStart = null;
let timerPauseDuration = 0;

// Initialize timer
function initTimer(endTime) {
    // Clear any existing timer
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    // Set the end time
    timerEndTime = endTime;
    timerPaused = false;
    timerPauseDuration = 0;
    
    // Update timer immediately
    updateTimerDisplay();
    
    // Set up interval to update timer every second
    timerInterval = setInterval(updateTimerDisplay, 1000);
}

// Update timer display
function updateTimerDisplay() {
    if (!timerEndTime) return;
    
    if (timerPaused) {
        // Don't update the time if paused
        return;
    }
    
    const now = new Date();
    const remaining = timerEndTime - now - timerPauseDuration;
    
    if (remaining <= 0) {
        // Timer complete
        clearInterval(timerInterval);
        document.getElementById('time-remaining').textContent = 'Complete!';
        
        // Play sound if enabled
        playTimerCompleteSound();
        
        // Send notification if enabled
        showTimerCompleteNotification();
        
        return;
    }
    
    // Update the display
    document.getElementById('time-remaining').textContent = formatTime(remaining);
}

// Toggle timer pause/resume
function toggleTimer() {
    if (!timerEndTime) return;
    
    if (timerPaused) {
        // Resume timer
        const pauseDuration = new Date() - timerPauseStart;
        timerPauseDuration += pauseDuration;
        timerPaused = false;
        
        // Update button
        document.getElementById('timer-start-pause').innerHTML = '<i class="fas fa-pause"></i>';
    } else {
        // Pause timer
        timerPaused = true;
        timerPauseStart = new Date();
        
        // Update button
        document.getElementById('timer-start-pause').innerHTML = '<i class="fas fa-play"></i>';
    }
}

// Reset timer to original duration
function resetTimer() {
    if (!timerEndTime) return;
    
    // Get the original duration
    const originalDuration = getStepDuration();
    
    // Reset the end time
    timerEndTime = new Date(Date.now() + originalDuration);
    timerPaused = false;
    timerPauseDuration = 0;
    
    // Update button
    document.getElementById('timer-start-pause').innerHTML = '<i class="fas fa-pause"></i>';
    
    // Update display
    updateTimerDisplay();
}

// Get the duration for the current step
function getStepDuration() {
    if (!window.currentSession) return 0;
    
    const recipe = window.recipes[window.currentSession.recipeId];
    if (!recipe) return 0;
    
    const step = recipe.steps.find(s => s.name === window.currentSession.currentStep);
    if (!step) return 0;
    
    return step.duration * 1000; // Convert seconds to milliseconds
}

// Play timer complete sound
function playTimerCompleteSound() {
    // Check if sound is enabled
    const soundEnabled = document.getElementById('sound-alerts')?.checked ?? true;
    if (!soundEnabled) return;
    
    // In a real app, would play a sound
    // For this demo, just output to console
    console.log('Timer complete sound played');
}

// Show timer complete notification
function showTimerCompleteNotification() {
    // Check if notifications are enabled
    const notificationsEnabled = document.getElementById('enable-notifications')?.checked ?? true;
    if (!notificationsEnabled) return;
    
    // Check if browser supports notifications
    if (!('Notification' in window)) return;
    
    // Check if permission is granted
    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
        return;
    }
    
    // Show notification
    const stepName = window.currentSession?.currentStep || 'Current step';
    const notification = new Notification('Bread Timer Complete', {
        body: `Your ${stepName} timer is complete!`,
        icon: 'img/bread-icon.png' // Would use a real icon in a production app
    });
    
    // Close notification after 10 seconds
    setTimeout(() => notification.close(), 10000);
}

// Format time in milliseconds to a readable string
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    } else {
        return `${pad(minutes)}:${pad(seconds)}`;
    }
}

// Pad a number with leading zeros
function pad(num) {
    return num.toString().padStart(2, '0');
} 