// Recipe steps based on Tartine Basic Country Sourdough
const recipeSteps = [
    {
        id: 1,
        title: "Making the Leaven (Night Before)",
        instructions: `
            <p>1. Place a medium bowl on a scale. Add 200g of 78°F (25°C) water.</p>
            <p>2. Take a generous tablespoon of mature starter and mix into the water.</p>
            <p>3. Add 100g of whole wheat flour & 100g of bread flour and mix thoroughly.</p>
            <p>4. Cover with a lid and let rise overnight at a cool room temperature (around 65°F/18°C).</p>
        `,
        timer: 8 * 60 * 60, // 8 hours in seconds
        timerLabel: "Leaven Rise Time"
    },
    {
        id: 2,
        title: "Leaven Check & Autolyse",
        instructions: `
            <p>1. Perform the float test: Does some of the leaven float in water? If yes, proceed. If not, place in a warmer location and check again in 30 minutes.</p>
            <p>2. Weigh 700g of 80°F (27°C) water into a large mixing bowl.</p>
            <p>3. Add 200g leaven and stir to dissolve completely.</p>
            <p>4. Add 900g of bread flour and 100g of whole wheat flour.</p>
            <p>5. Mix by hand until incorporated and let rest for 25-40 minutes (autolyse).</p>
        `,
        timer: 40 * 60, // 40 minutes in seconds
        timerLabel: "Autolyse Rest"
    },
    {
        id: 3,
        title: "Add Salt & Begin Bulk Fermentation",
        instructions: `
            <p>1. Mix 20g of salt into 50g of warm water and stir to dissolve.</p>
            <p>2. Add salt water to the dough and incorporate by squeezing with your hand.</p>
            <p>3. Transfer to a clear container with a lid.</p>
            <p>4. Note the time — this marks the beginning of bulk fermentation.</p>
        `,
        timer: null,
        timerLabel: null
    },
    {
        id: 4,
        title: "First Fold (30 minutes into Bulk Fermentation)",
        instructions: `
            <p>Perform your first stretch and fold:</p>
            <p>1. Wet your hand.</p>
            <p>2. Grab the bottom of the dough, stretch it up, and fold it over itself.</p>
            <p>3. Rotate the container 90 degrees and repeat three more times until you've folded all four sides.</p>
            <p>4. Let rest for 30 minutes.</p>
        `,
        timer: 30 * 60, // 30 minutes in seconds
        timerLabel: "Rest Until Next Fold"
    },
    {
        id: 5,
        title: "Second Fold (1 hour into Bulk Fermentation)",
        instructions: `
            <p>Perform your second stretch and fold following the same technique as before.</p>
            <p>Let rest for 30 minutes.</p>
        `,
        timer: 30 * 60, // 30 minutes in seconds
        timerLabel: "Rest Until Next Fold"
    },
    {
        id: 6,
        title: "Third Fold (1.5 hours into Bulk Fermentation)",
        instructions: `
            <p>Perform your third stretch and fold, with gentler handling as the dough develops.</p>
            <p>Let rest for 30 minutes.</p>
        `,
        timer: 30 * 60, // 30 minutes in seconds
        timerLabel: "Rest Until Next Fold"
    },
    {
        id: 7,
        title: "Fourth Fold (2 hours into Bulk Fermentation)",
        instructions: `
            <p>Perform your fourth stretch and fold, being gentle with the dough.</p>
            <p>Let rest for 30 minutes.</p>
        `,
        timer: 30 * 60, // 30 minutes in seconds
        timerLabel: "Rest Until Next Fold"
    },
    {
        id: 8,
        title: "Fifth Fold (2.5 hours into Bulk Fermentation)",
        instructions: `
            <p>Perform your fifth stretch and fold, being very gentle with the dough.</p>
            <p>Let rest for 30 minutes.</p>
        `,
        timer: 30 * 60, // 30 minutes in seconds
        timerLabel: "Rest Until Next Fold"
    },
    {
        id: 9,
        title: "Sixth Fold (3 hours into Bulk Fermentation)",
        instructions: `
            <p>Perform your sixth and final stretch and fold (if needed).</p>
            <p>The dough should be getting billowy, requiring very gentle handling.</p>
            <p>Let rest until the bulk fermentation is complete (when ridges relax and volume increases 20-30%).</p>
        `,
        timer: 60 * 60, // 1 hour in seconds
        timerLabel: "Final Bulk Fermentation"
    },
    {
        id: 10,
        title: "Pre-shape",
        instructions: `
            <p>1. Gently turn out the dough onto an unfloured work surface.</p>
            <p>2. Lightly flour the top surface of the dough.</p>
            <p>3. Use a bench scraper to cut the dough into 2 equal pieces.</p>
            <p>4. Flip each piece so the floured side faces down.</p>
            <p>5. Use the bench knife and one hand to work each piece into a round shape with circular movements.</p>
            <p>6. Cover with a tea towel and let rest for 20-30 minutes.</p>
        `,
        timer: 30 * 60, // 30 minutes in seconds
        timerLabel: "Bench Rest"
    },
    {
        id: 11,
        title: "Final Shaping",
        instructions: `
            <p>1. Prepare bannetons by sprinkling generously with rice flour.</p>
            <p>2. Lightly flour tops of rounds and flip them.</p>
            <p>3. Make a series of folds:</p>
            <ul>
                <li>Stretch out 1/3 of dough closest to you and fold over the middle third</li>
                <li>Stretch out the right and left sides and fold over the middle third</li>
                <li>Take the two corners furthest away, stretch them out, and pull them over the whole loaf</li>
            </ul>
            <p>4. Round it out to ensure good surface tension.</p>
            <p>5. Optional: Place round upside down onto a plate with seasoning, then place upside down into the banneton.</p>
        `,
        timer: null,
        timerLabel: null
    },
    {
        id: 12,
        title: "Final Rise (Cold Fermentation)",
        instructions: `
            <p>1. Place the dough in the refrigerator overnight inside a large plastic bag.</p>
            <p>2. This cold fermentation makes the dough much easier to score.</p>
            <p>3. Aim to bake the bread 12-18 hours after shaping.</p>
        `,
        timer: 12 * 60 * 60, // 12 hours in seconds
        timerLabel: "Cold Fermentation"
    },
    {
        id: 13,
        title: "Baking Preparation",
        instructions: `
            <p>1. About 20 minutes before baking, place both pieces of the Dutch oven or combo cooker in the oven and preheat to 500°F (260°C).</p>
        `,
        timer: 20 * 60, // 20 minutes in seconds
        timerLabel: "Preheat Time"
    },
    {
        id: 14,
        title: "Baking - First Loaf",
        instructions: `
            <p>1. Remove the shallow pan and place on the stove.</p>
            <p>2. Gently release the dough from the banneton around the sides, then invert the basket over the pan to turn the dough into it.</p>
            <p>3. Use the corner of a razor to score the dough with your desired pattern.</p>
            <p>4. Return the pan to the oven, cover with the lid, and immediately reduce the heat to 450°F (230°C).</p>
            <p>5. Bake covered for 20 minutes.</p>
        `,
        timer: 20 * 60, // 20 minutes in seconds
        timerLabel: "Covered Bake"
    },
    {
        id: 15,
        title: "Baking - First Loaf Uncovered",
        instructions: `
            <p>1. Remove the lid (keep it in the oven for the second loaf).</p>
            <p>2. Continue baking uncovered for 15-25 minutes until it reaches a very deep golden brown.</p>
            <p>3. Transfer the loaf to a cooling rack.</p>
        `,
        timer: 20 * 60, // 20 minutes in seconds
        timerLabel: "Uncovered Bake"
    },
    {
        id: 16,
        title: "Baking - Second Loaf",
        instructions: `
            <p>1. Return the shallow cast iron pan to the oven, reheat to 500°F (260°C).</p>
            <p>2. Repeat the process for the second loaf.</p>
        `,
        timer: 20 * 60, // 20 minutes in seconds
        timerLabel: "Covered Bake"
    },
    {
        id: 17,
        title: "Baking - Second Loaf Uncovered",
        instructions: `
            <p>1. Remove the lid.</p>
            <p>2. Continue baking uncovered for 15-25 minutes until it reaches a very deep golden brown.</p>
            <p>3. Transfer the loaf to a cooling rack.</p>
        `,
        timer: 20 * 60, // 20 minutes in seconds
        timerLabel: "Uncovered Bake"
    },
    {
        id: 18,
        title: "Cooling & Completion",
        instructions: `
            <p>1. Let the loaves cool completely for at least 1 hour before slicing.</p>
            <p>2. The bread is best eaten the same day but will keep for several days in a paper bag or wrapped in a kitchen towel.</p>
            <p>Congratulations on your freshly baked Tartine Country Sourdough!</p>
        `,
        timer: 60 * 60, // 1 hour in seconds
        timerLabel: "Cooling Time"
    }
]; 