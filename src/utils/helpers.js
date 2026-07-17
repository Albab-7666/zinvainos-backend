const crypto = require('crypto');

// Generate random string
const generateRandomString = (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
};

// Generate invoice number
const generateInvoiceNumber = (prefix = 'INV') => {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${timestamp}${random}`;
};

// Format currency
const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
    }).format(amount);
};

// Calculate percentage
const calculatePercentage = (value, total) => {
    if (total === 0) return 0;
    return (value / total) * 100;
};

// Get date range
const getDateRange = (period = 'week') => {
    const now = new Date();
    let start, end;

    switch (period) {
        case 'week':
            start = new Date(now);
            start.setDate(start.getDate() - 7);
            end = now;
            break;
        case 'month':
            start = new Date(now);
            start.setMonth(start.getMonth() - 1);
            end = now;
            break;
        case 'quarter':
            start = new Date(now);
            start.setMonth(start.getMonth() - 3);
            end = now;
            break;
        case 'year':
            start = new Date(now);
            start.setFullYear(start.getFullYear() - 1);
            end = now;
            break;
        default:
            start = new Date(now);
            start.setDate(start.getDate() - 7);
            end = now;
    }

    return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
    };
};

// Pagination helper
const paginate = (data, limit = 100, offset = 0) => {
    return {
        data: data.slice(offset, offset + limit),
        pagination: {
            total: data.length,
            limit: limit,
            offset: offset,
            totalPages: Math.ceil(data.length / limit)
        }
    };
};

// Check if date is in range
const isDateInRange = (date, start, end) => {
    const d = new Date(date);
    const s = new Date(start);
    const e = new Date(end);
    return d >= s && d <= e;
};

// Get working days between two dates
const getWorkingDays = (start, end) => {
    let count = 0;
    const current = new Date(start);
    const endDate = new Date(end);

    while (current <= endDate) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) {
            count++;
        }
        current.setDate(current.getDate() + 1);
    }

    return count;
};

module.exports = {
    generateRandomString,
    generateInvoiceNumber,
    formatCurrency,
    calculatePercentage,
    getDateRange,
    paginate,
    isDateInRange,
    getWorkingDays
};