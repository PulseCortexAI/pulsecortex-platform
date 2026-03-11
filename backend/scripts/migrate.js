#!/usr/bin/env node
// Database migration script for PulseCortex Platform

require('dotenv').config();
const { sequelize, User, ApiKey } = require('../src/models');
const bcrypt = require('bcryptjs');
const { BCRYPT_ROUNDS } = require('../src/middleware/auth');

async function migrate() {
  console.log('Starting database migration...');
  
  try {
    await sequelize.authenticate();
    console.log('Database connection established');
    
    // Sync all models (drops existing tables)
    await sequelize.sync({ force: true });
    console.log('Tables created successfully');
    
    // Create admin user for testing
    const adminPassword = 'admin123'; // In production, use strong environment variable
    const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS || 12);
    
    const adminUser = await User.create({
      email: 'admin@pulsecortex.com',
      username: 'admin',
      passwordHash: passwordHash,
      isVerified: true,
      credits: 100.00,
    });
    
    console.log('Admin user created:', adminUser.email);
    
    // Create test API key
    const testApiKey = await ApiKey.create({
      key: 'sk-test-' + Math.random().toString(36).substring(2, 15),
      name: 'Test Key',
      userId: adminUser.id,
      rateLimit: 5000,
    });
    
    console.log('Test API key created:', testApiKey.key);
    
    console.log('\nMigration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Start the server: npm run dev');
    console.log('2. Test the API: curl http://localhost:3000/health');
    console.log('3. Use admin credentials: admin@pulsecortex.com / admin123');
    console.log('4. API key:', testApiKey.key);
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
    console.log('Database connection closed');
  }
}

// Run migration
migrate();