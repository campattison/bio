// Recipe handling functionality

// Get recipe by ID
function getRecipe(recipeId) {
    return window.recipes?.[recipeId] || null;
}

// Get all recipes
function getAllRecipes() {
    return window.recipes || {};
}

// Calculate adjusted recipe values based on environmental conditions
function calculateRecipeAdjustments(recipe, environmentalData) {
    if (!recipe || !environmentalData) return {};
    
    // Only adjust if recipe allows it
    if (!recipe.adjustForConditions) {
        return {
            water: recipe.ingredients.find(i => i.name.includes('Water'))?.amount || '700g',
            bulkTime: formatDuration(recipe.steps.find(s => s.name === 'Bulk Fermentation')?.duration || 14400),
            proofTime: formatDuration(recipe.steps.find(s => s.name === 'Final Proof')?.duration || 43200)
        };
    }
    
    // Get temperature and humidity
    const temp = environmentalData.temperature;
    const humidity = environmentalData.humidity;
    
    // Calculate differences from optimal conditions
    const tempDiff = temp - recipe.optimalTemperature;
    const humidityDiff = humidity - recipe.optimalHumidity;
    
    // Adjust water amount based on humidity
    let waterAmount = 700; // default base water amount
    recipe.ingredients.forEach(i => {
        if (i.name.includes('Water')) {
            const match = i.amount.match(/(\d+)/);
            if (match) {
                waterAmount = parseInt(match[1]);
            }
        }
    });
    
    let waterAdjustment = 0;
    if (humidityDiff < 0) {
        // Drier environment, add more water
        waterAdjustment = Math.round(Math.abs(humidityDiff) * 0.5);
    } else if (humidityDiff > 0) {
        // More humid, reduce water
        waterAdjustment = Math.round(-humidityDiff * 0.3);
    }
    
    // Adjust fermentation time based on temperature
    let timeAdjustment = 0; // in minutes
    if (tempDiff < 0) {
        // Cooler environment, extend fermentation
        timeAdjustment = Math.round(Math.abs(tempDiff) * 15);
    } else if (tempDiff > 0) {
        // Warmer environment, reduce fermentation
        timeAdjustment = Math.round(-tempDiff * 10);
    }
    
    // Get original times
    const bulkTime = recipe.steps.find(s => s.name === 'Bulk Fermentation')?.duration || 14400;
    const proofTime = recipe.steps.find(s => s.name === 'Final Proof')?.duration || 43200;
    
    // Apply adjustments
    const adjustedWater = waterAmount + waterAdjustment;
    const adjustedBulkTime = bulkTime + (timeAdjustment * 60); // convert minutes to seconds
    const adjustedProofTime = proofTime + (timeAdjustment * 60 * 2); // proof is more affected by temperature
    
    return {
        water: `${adjustedWater}g`,
        bulkTime: formatDuration(adjustedBulkTime),
        proofTime: formatDuration(adjustedProofTime)
    };
}

// Get ingredients for a recipe adjusted for environment
function getAdjustedIngredientsHTML(recipe, environmentalData) {
    if (!recipe || !recipe.ingredients) return '';
    
    const adjustments = calculateRecipeAdjustments(recipe, environmentalData);
    let html = '<ul>';
    
    recipe.ingredients.forEach(ingredient => {
        let amount = ingredient.amount;
        
        // Apply water adjustment if this is the water ingredient
        if (ingredient.name.includes('Water') && !ingredient.name.includes('salt')) {
            amount = adjustments.water;
        }
        
        html += `<li>${amount} ${ingredient.name}</li>`;
    });
    
    html += '</ul>';
    return html;
}

// Get steps for a recipe adjusted for environment
function getAdjustedStepsHTML(recipe, environmentalData) {
    if (!recipe || !recipe.steps) return '';
    
    const adjustments = calculateRecipeAdjustments(recipe, environmentalData);
    let html = '';
    
    recipe.steps.forEach(step => {
        let duration = step.duration;
        let durationText = duration > 0 ? formatDuration(duration) : 'Variable';
        
        // Apply time adjustments for fermentation steps
        if (step.name === 'Bulk Fermentation') {
            durationText = adjustments.bulkTime;
        } else if (step.name === 'Final Proof') {
            durationText = adjustments.proofTime;
        }
        
        html += `
            <div class="recipe-step">
                <h4>${step.name}</h4>
                <div class="step-time">${durationText}</div>
                <p>${step.instructions}</p>
            </div>
        `;
    });
    
    return html;
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