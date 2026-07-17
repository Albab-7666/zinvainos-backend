module.exports = {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:1420'],
    credentials: true,
    optionsSuccessStatus: 200
};