const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API endpoint
app.post('/analyze', async (req, res) => {
    try {
        // Here you would typically make the call to your AI service
        // For now, sending a mock response
        res.json({
            choices: [{
                message: {
                    content: "This is a test analysis response..."
                }
            }]
        });
    } catch (error) {
        res.status(500).json({ error: 'Analysis failed' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 