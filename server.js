const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.post('/analyze', async (req, res) => {
    try {
        const { situation, analysisType } = req.body;
        
        let prompt;
        if (analysisType === 'kantian') {
            prompt = `You are a Kantian ethics expert. Please analyze the following situation using Kantian ethical principles. 
            Follow this structured approach, as shown in these examples:

            Example 1:
            Situation: Lying on a job application to get hired
            Analysis:
            1. Maxim: "When seeking employment, I will deceive others about my qualifications to achieve my goals"
            2. Universalization Test: Fails - If everyone lied on job applications, the entire system of hiring would break down as trust would be impossible
            3. Humanity Formula: Fails - Treats both employer and other candidates as mere means, denying their rational autonomy
            4. Conclusion: This action is not morally permissible under Kantian ethics

            Example 2:
            Situation: Donating to charity anonymously
            Analysis:
            1. Maxim: "I will give resources to help others in need without seeking recognition"
            2. Universalization Test: Passes - A world where everyone helps others in need would be coherent and desirable
            3. Humanity Formula: Passes - Treats recipients as ends in themselves, respecting their dignity and autonomy
            4. Conclusion: This action is morally permissible and arguably dutiful under Kantian ethics

            Now, please analyze the following situation:
            ${situation}

            Please provide a detailed analysis following the same structure:
            1. Clearly state the maxim (the underlying principle of action)
            2. Apply the Universalization Test (Formula of Universal Law)
               - Can this maxim be universalized without contradiction?
               - What would a world look like where everyone acted on this maxim?
            3. Apply the Humanity Formula
               - Does this action treat humanity as an end in itself?
               - Does it respect the rational autonomy of all involved?
            4. Provide a clear conclusion about the moral permissibility of the action
            5. Optional: Suggest any relevant modifications that would make the action more aligned with Kantian ethics

            Please be thorough in your reasoning and specific in your conclusions.`;
        } else if (analysisType === 'consequentialist') {
            prompt = `You are a consequentialist ethics expert. Please analyze the following situation using consequentialist ethical principles.
            
            Follow this structured approach, as shown in these examples:
            
            Example 1:
            Situation: Lying on a job application to get hired
            Analysis:
            1. Stakeholders: Job applicant, employer, other candidates, workplace community
            2. Immediate Consequences:
               - Personal gain for the applicant
               - Potential harm to employer (incompetent hire)
               - Unfair disadvantage to honest candidates
            3. Long-term Consequences:
               - Decreased workplace efficiency
               - Erosion of trust in hiring systems
               - Potential cascading effects of dishonesty
            4. Aggregate Welfare Analysis:
               - Net negative impact on overall welfare
               - Creates systemic inefficiencies
            5. Conclusion: Action not justified under consequentialist ethics
            
            Example 2:
            Situation: Donating to charity anonymously
            Analysis:
            1. Stakeholders: Donor, charity recipients, charity organization
            2. Immediate Consequences:
               - Direct aid to beneficiaries
               - Resource transfer to effective causes
               - No social recognition benefits
            3. Long-term Consequences:
               - Sustained improvement in recipients' lives
               - Potential inspiration for others
               - Enhanced charitable efficiency
            4. Aggregate Welfare Analysis:
               - Significant positive impact on overall welfare
               - Efficient allocation of resources
            5. Conclusion: Action strongly justified under consequentialist ethics
            
            Now, please analyze the following situation:
            ${situation}
            
            Please provide a detailed analysis following the same structure:
            1. Identify all relevant stakeholders
            2. Analyze immediate consequences for each stakeholder
            3. Consider long-term and systemic consequences
            4. Evaluate aggregate welfare impact
               - Consider both quantitative and qualitative factors
               - Assess distribution of benefits and harms
            5. Provide a clear conclusion about the ethical justifiability of the action
            6. Optional: Suggest modifications to maximize positive consequences
            
            Please be thorough in your reasoning and specific in your conclusions.`;
        }
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4",
                messages: [{
                    role: "user",
                    content: prompt
                }],
                temperature: 0.7
            })
        });

        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 