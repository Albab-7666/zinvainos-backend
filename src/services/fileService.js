const fs = require('fs');
const path = require('path');

class FileService {
    constructor() {
        this.uploadDir = process.env.UPLOAD_DIR || './uploads';
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
    }

    saveFile(file) {
        const filename = `${Date.now()}-${file.originalname}`;
        const filepath = path.join(this.uploadDir, filename);
        fs.writeFileSync(filepath, file.buffer);
        return { filename, filepath };
    }

    deleteFile(filepath) {
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            return true;
        }
        return false;
    }

    getFileStream(filepath) {
        return fs.createReadStream(filepath);
    }

    getFileInfo(filepath) {
        const stats = fs.statSync(filepath);
        return {
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime
        };
    }

    async uploadFile(file, moduleType, moduleId, userId) {
        const { filename, filepath } = this.saveFile(file);
        return {
            filename,
            filepath,
            size: file.size,
            mimeType: file.mimetype,
            moduleType,
            moduleId,
            uploadedBy: userId
        };
    }

    async deleteFileById(filepath) {
        return this.deleteFile(filepath);
    }
}

module.exports = new FileService();