#!/usr/bin/env node

/**
 * Simple script to check current date and time
 */

console.log('Current Date and Time Information:');
console.log('==================================');

const now = new Date();
console.log('Current Date/Time:', now.toISOString());
console.log('Local Date/Time:', now.toString());
console.log('Date only:', now.toDateString());
console.log('Time only:', now.toTimeString());

console.log('\nDate Components:');
console.log('Year:', now.getFullYear());
console.log('Month:', now.getMonth() + 1); // 0-based, so add 1
console.log('Day:', now.getDate());
console.log('Hours:', now.getHours());
console.log('Minutes:', now.getMinutes());

console.log('\nTimezone Info:');
console.log('Timezone Offset (minutes):', now.getTimezoneOffset());
console.log('UTC Date/Time:', now.toUTCString());

// Test date calculations
console.log('\nTest Date Calculations:');

// Test for Jan 12, 2026 (today)
const jan12 = new Date('2026-01-12');
jan12.setHours(0, 0, 0, 0);
console.log('Jan 12, 2026 start of day:', jan12.toISOString());

const jan12End = new Date('2026-01-12');
jan12End.setHours(23, 59, 59, 999);
console.log('Jan 12, 2026 end of day:', jan12End.toISOString());

// Test for Jan 16, 2026
const jan16 = new Date('2026-01-16');
jan16.setHours(0, 0, 0, 0);
console.log('Jan 16, 2026 start of day:', jan16.toISOString());

const jan16End = new Date('2026-01-16');
jan16End.setHours(23, 59, 59, 999);
console.log('Jan 16, 2026 end of day:', jan16End.toISOString());

// Check if current time is within ranges
console.log('\nActive Checks:');
console.log('Is now >= Jan 12 start?', now >= jan12);
console.log('Is now <= Jan 12 end?', now <= jan12End);
console.log('Is Jan 12 active today?', now >= jan12 && now <= jan12End);

console.log('Is now >= Jan 16 start?', now >= jan16);
console.log('Is now <= Jan 16 end?', now <= jan16End);
console.log('Is Jan 16 active today?', now >= jan16 && now <= jan16End);

// Days remaining calculations
if (now <= jan12End) {
  const daysRemaining = Math.ceil((jan12End - now) / (1000 * 60 * 60 * 24));
  console.log('Days remaining for Jan 12 WFH:', daysRemaining);
}

if (now <= jan16End) {
  const daysRemaining = Math.ceil((jan16End - now) / (1000 * 60 * 60 * 24));
  console.log('Days remaining for Jan 16 WFH:', daysRemaining);
}