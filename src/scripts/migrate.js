const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');

async function migrate() {
    console.log('🚀 Starting migration...');
    
    try {
        // Check if schema.sql exists
        const schemaPath = path.join(__dirname, '../../database/schema.sql');
        
        if (!fs.existsSync(schemaPath)) {
            console.error('❌ schema.sql not found at:', schemaPath);
            console.log('💡 Create the file or run the SQL manually in Supabase SQL Editor');
            process.exit(1);
        }
        
        const sql = fs.readFileSync(schemaPath, 'utf8');
        
        if (!sql.trim()) {
            console.error('❌ schema.sql is empty');
            process.exit(1);
        }
        
        console.log('📄 schema.sql loaded successfully');
        console.log('🔄 Executing SQL...');
        
        await pool.query(sql);
        console.log('✅ Migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        if (error.stack) {
            console.error('📋 Stack trace:', error.stack);
        }
        process.exit(1);
    } finally {
        await pool.end();
        console.log('🔌 Database connection closed');
    }
}

// Run migration
migrate();