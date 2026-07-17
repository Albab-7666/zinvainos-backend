const { pool } = require('../config/database');

async function seed() {
    console.log('🌱 No seed data to create...');
    console.log('');
    console.log('📝 INSTRUCTIONS:');
    console.log('   1. Go to: http://localhost:5173/register');
    console.log('   2. Register as CEO (select "CEO" in role dropdown)');
    console.log('   3. Go to Supabase → Table Editor → users');
    console.log('   4. Change your status from "PENDING" to "ACTIVE"');
    console.log('   5. Login and start using the system!');
    console.log('');
    console.log('✅ Seed completed (no data created).');
    await pool.end();
}

seed();