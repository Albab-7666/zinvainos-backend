const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'ZinvainOS API is running'
    });
});

app.get('/', (req, res) => {
    res.json({ 
        message: 'ZinvainOS API',
        version: '1.0.0',
        status: 'active'
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});