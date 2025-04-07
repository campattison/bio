// Weather functionality
document.addEventListener('DOMContentLoaded', () => {
    // Initialize weather
    updateWeather();
    
    // Add event listeners for manual weather inputs
    document.getElementById('manual-temp').addEventListener('change', updateWeather);
    document.getElementById('manual-humidity').addEventListener('change', updateWeather);
    document.getElementById('manual-temp-home').addEventListener('change', updateWeather);
    document.getElementById('manual-humidity-home').addEventListener('change', updateWeather);
});

// Update weather data
function updateWeather() {
    // Get settings from global object or use defaults
    const settings = window.appSettings || {
        location: 'Nashville, TN',
        manualTemp: 72,
        manualHumidity: 50
    };
    
    // Get current manual values
    const temperature = parseFloat(document.getElementById('manual-temp').value);
    const humidity = parseFloat(document.getElementById('manual-humidity').value);
    
    // Try to get actual weather data via API
    fetchWeatherData(settings.location)
        .then(data => {
            // If successful, display the fetched data
            displayWeatherData(data);
        })
        .catch(error => {
            console.log('Using manual weather input:', error);
            // If error or no API available, use the manual values
            displayWeatherData({
                temperature: temperature,
                humidity: humidity,
                location: settings.location,
                description: "Using manual input"
            });
        });
}

// Try to fetch weather data from a weather API
async function fetchWeatherData(location) {
    // This is a mock function - in a real app, you would implement an API call
    // For now, we'll just throw an error to use manual input
    throw new Error('Weather API not implemented');
    
    // Example implementation with OpenWeatherMap (you would need an API key)
    /*
    const apiKey = 'your-api-key';
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${apiKey}&units=imperial`;
    
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Weather data not available');
    }
    
    const data = await response.json();
    return {
        temperature: Math.round(data.main.temp),
        humidity: data.main.humidity,
        location: location,
        description: data.weather[0].description
    };
    */
}

// Display weather data
function displayWeatherData(data) {
    // Update UI
    document.getElementById('current-temp').textContent = `${data.temperature}°F`;
    document.getElementById('current-humidity').textContent = `${data.humidity}%`;
    
    // Make sure manual inputs match
    document.getElementById('manual-temp').value = data.temperature;
    document.getElementById('manual-humidity').value = data.humidity;
    document.getElementById('manual-temp-home').value = data.temperature;
    document.getElementById('manual-humidity-home').value = data.humidity;
    
    // Update location display if we have an element for it
    const locationElement = document.getElementById('weather-location');
    if (locationElement) {
        locationElement.textContent = data.location;
    }
    
    // Update weather description if available
    if (data.description) {
        const descriptionElement = document.getElementById('weather-description');
        if (descriptionElement) {
            descriptionElement.textContent = data.description;
        }
    }
    
    // Update recommendations
    updateBakingRecommendations(data);
    
    // Store the data for other parts of the app to use
    window.currentWeather = data;
    
    // If we have an active session, update its environmental data
    if (window.currentSession) {
        window.currentSession.environmentalData = {
            temperature: data.temperature,
            humidity: data.humidity
        };
    }
}

// Update baking recommendations based on weather
function updateBakingRecommendations(data) {
    const temp = data.temperature;
    const humidity = data.humidity;
    const recommendationsElement = document.getElementById('baking-recommendation');
    
    if (!recommendationsElement) return;
    
    let recommendations = '<ul>';
    
    // Temperature recommendations
    if (temp < 65) {
        recommendations += `<li>It's cool (${temp}°F). Consider these adjustments:
            <ul>
                <li>Your dough will rise more slowly</li>
                <li>You may need to extend bulk fermentation time by 30-60 minutes</li>
                <li>Consider using a proofing box or warm spot like an oven with the light on</li>
                <li>Use slightly warmer water (85-90°F) for mixing</li>
            </ul>
        </li>`;
    } else if (temp > 80) {
        recommendations += `<li>It's warm (${temp}°F). Consider these adjustments:
            <ul>
                <li>Your dough will ferment faster</li>
                <li>Use cooler water (65-70°F) for mixing</li>
                <li>Check your dough more frequently during bulk fermentation</li>
                <li>Consider reducing bulk fermentation time by 20-30%</li>
                <li>Final proof may only need 1-2 hours at room temperature</li>
            </ul>
        </li>`;
    } else {
        recommendations += `<li>Temperature (${temp}°F) is ideal for bread baking!
            <ul>
                <li>Standard fermentation times should work well</li>
                <li>Use water around 75-78°F for mixing</li>
            </ul>
        </li>`;
    }
    
    // Humidity recommendations
    if (humidity < 40) {
        recommendations += `<li>It's dry (${humidity}% humidity):
            <ul>
                <li>Cover your dough well during resting to prevent surface drying</li>
                <li>You may need slightly more water (2-5% hydration)</li>
                <li>Spray your oven with water when loading bread for better crust</li>
                <li>A Dutch oven is highly recommended to trap steam</li>
            </ul>
        </li>`;
    } else if (humidity > 70) {
        recommendations += `<li>It's humid (${humidity}% humidity):
            <ul>
                <li>Your dough may be stickier than usual</li>
                <li>Consider reducing water content by 2-3%</li>
                <li>Use more flour when shaping to prevent sticking</li>
                <li>Focaccia or ciabatta would work well today</li>
                <li>Bread will stay fresh longer in this humidity</li>
            </ul>
        </li>`;
    } else {
        recommendations += `<li>Humidity (${humidity}%) is good for bread baking
            <ul>
                <li>Standard hydration levels should work well</li>
                <li>Dough consistency should be predictable</li>
            </ul>
        </li>`;
    }
    
    // Special case for ideal conditions
    if (temp >= 70 && temp <= 78 && humidity >= 45 && humidity <= 65) {
        recommendations = '<ul><li><strong>Conditions are perfect for bread baking!</strong> Your fermentation should be very predictable and you should get excellent results following standard timings.</li></ul>';
    }
    
    recommendations += '</ul>';
    recommendationsElement.innerHTML = recommendations;
} 