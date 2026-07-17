const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT),
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }

    async sendEmail({ to, subject, html, text }) {
        try {
            const info = await this.transporter.sendMail({
                from: process.env.EMAIL_FROM || 'noreply@zinvain.com',
                to,
                subject,
                text: text || '',
                html: html || ''
            });
            return info;
        } catch (error) {
            console.error('Email send error:', error);
            throw error;
        }
    }

    async sendWelcomeEmail(email, name) {
        return this.sendEmail({
            to: email,
            subject: 'Welcome to ZinvainOS',
            html: `
                <h1>Welcome to ZinvainOS, ${name}!</h1>
                <p>Your account has been created. Please wait for admin approval.</p>
                <p>You will receive a notification when your account is activated.</p>
            `
        });
    }

    async sendApprovalEmail(email, name) {
        return this.sendEmail({
            to: email,
            subject: 'Account Approved - ZinvainOS',
            html: `
                <h1>Welcome to ZinvainOS, ${name}!</h1>
                <p>Your account has been approved. You can now log in.</p>
                <a href="${process.env.FRONTEND_URL}/login">Log in to ZinvainOS</a>
            `
        });
    }

    async sendPasswordResetEmail(email, token) {
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
        return this.sendEmail({
            to: email,
            subject: 'Password Reset - ZinvainOS',
            html: `
                <h1>Password Reset</h1>
                <p>Click the link below to reset your password:</p>
                <a href="${resetUrl}">${resetUrl}</a>
                <p>This link will expire in 1 hour.</p>
            `
        });
    }

    async sendInvoiceEmail(email, invoiceNumber, invoiceData) {
        return this.sendEmail({
            to: email,
            subject: `Invoice #${invoiceNumber} - ZinvainOS`,
            html: `
                <h1>Invoice #${invoiceNumber}</h1>
                <p>Please find your invoice attached.</p>
                <p>Total: $${invoiceData.total}</p>
                <p>Due Date: ${invoiceData.dueDate}</p>
            `
        });
    }
}

module.exports = new EmailService();