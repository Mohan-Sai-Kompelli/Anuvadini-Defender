#!/usr/bin/env node

/**
 * Debug script to check WFH days calculation
 * Usage: node debug-wfh-days.js
 */

const WFHRequest = require('./models/WFHRequest');
const Student = require('./models/Student');
const mongoose = require('mongoose');
require('dotenv').config();

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-system');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function debugWFHDays() {
  try {
    console.log('\n🔍 Debugging WFH Days Calculation...\n');

    // Find all WFH requests
    const wfhRequests = await WFHRequest.find({}).populate('student', 'fullName uid');
    
    console.log(`Found ${wfhRequests.length} WFH requests:\n`);
    
    wfhRequests.forEach((request, index) => {
      console.log(`${index + 1}. ${request.student?.fullName || 'Unknown'} (${request.student?.uid || 'No UID'})`);
      console.log(`   Status: ${request.status}`);
      console.log(`   Start: ${request.startDate.toDateString()}`);
      console.log(`   End: ${request.endDate.toDateString()}`);
      console.log(`   Days: ${request.days}`);
      console.log(`   Reason: ${request.reason}`);
      console.log(`   Created: ${request.createdAt.toDateString()}`);
      
      // Manual calculation
      const start = new Date(request.startDate);
      const end = new Date(request.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      const diffTime = end - start;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const manualDays = diffDays + 1;
      
      console.log(`   Manual calculation: ${manualDays} days`);
      
      if (request.days !== manualDays) {
        console.log(`   ⚠️  MISMATCH! Virtual: ${request.days}, Manual: ${manualDays}`);
      }
      
      // Check if currently active
      const now = new Date();
      const isActive = request.status === 'approved' && 
                      request.startDate <= now && 
                      request.endDate >= now;
      
      if (isActive) {
        const daysRemaining = Math.ceil((request.endDate - now) / (1000 * 60 * 60 * 24));
        console.log(`   🟢 CURRENTLY ACTIVE - Days remaining: ${daysRemaining}`);
      }
      
      console.log('');
    });

    // Check for active requests specifically
    const now = new Date();
    const activeRequests = await WFHRequest.find({
      status: 'approved',
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).populate('student', 'fullName uid');

    console.log(`\n🟢 Currently Active WFH Requests: ${activeRequests.length}\n`);
    
    activeRequests.forEach((request, index) => {
      const daysRemaining = Math.ceil((request.endDate - now) / (1000 * 60 * 60 * 24));
      console.log(`${index + 1}. ${request.student?.fullName || 'Unknown'}`);
      console.log(`   Start: ${request.startDate.toDateString()}`);
      console.log(`   End: ${request.endDate.toDateString()}`);
      console.log(`   Days remaining: ${daysRemaining}`);
      console.log(`   Total days: ${request.days}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

async function main() {
  try {
    await connectDB();
    await debugWFHDays();
  } catch (error) {
    console.error('❌ Script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the debug
main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});