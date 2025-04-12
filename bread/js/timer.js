// Timer functionality
class Timer {
    constructor(totalSeconds, onTick, onComplete) {
        this.totalSeconds = totalSeconds;
        this.remainingSeconds = totalSeconds;
        this.onTick = onTick;
        this.onComplete = onComplete;
        this.timerId = null;
        this.startTime = null;
        this.pausedTime = null;
    }

    start() {
        if (this.timerId !== null) return; // Already running

        // If we're resuming from pause
        if (this.pausedTime !== null) {
            // Adjust the start time to account for the time already elapsed
            const pauseDuration = Date.now() - this.pausedTime;
            this.startTime += pauseDuration;
            this.pausedTime = null;
        } else {
            // Starting fresh
            this.startTime = Date.now() - ((this.totalSeconds - this.remainingSeconds) * 1000);
        }

        this.timerId = setInterval(() => {
            const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
            this.remainingSeconds = Math.max(0, this.totalSeconds - elapsedSeconds);
            
            if (this.onTick) {
                this.onTick(this.remainingSeconds);
            }
            
            if (this.remainingSeconds <= 0) {
                this.stop();
                if (this.onComplete) {
                    this.onComplete();
                }
            }
        }, 1000);

        return this;
    }

    pause() {
        if (this.timerId === null) return; // Not running
        
        clearInterval(this.timerId);
        this.timerId = null;
        this.pausedTime = Date.now();
        
        return this;
    }

    stop() {
        if (this.timerId === null) return; // Not running
        
        clearInterval(this.timerId);
        this.timerId = null;
        this.pausedTime = null;
        
        return this;
    }

    reset() {
        this.stop();
        this.remainingSeconds = this.totalSeconds;
        if (this.onTick) {
            this.onTick(this.remainingSeconds);
        }
        
        return this;
    }

    isRunning() {
        return this.timerId !== null;
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        return [
            hours.toString().padStart(2, '0'),
            minutes.toString().padStart(2, '0'),
            secs.toString().padStart(2, '0')
        ].join(':');
    }
} 