const cron = require('node-cron');
const Student = require('../models/Student');
const pushNotificationService = require('./pushNotificationService');
const spotCheckService = require('./spotCheckService');
const absenceService = require('./absenceService');
const classReminderService = require('./classReminderService');
const activityLogReminderService = require('./activityLogReminderService');

class CronService {
  constructor() {
    this.jobs = [];
  }

  start() {
    console.log('Starting cron jobs...');

    // Check for expiring WFH assignments (runs daily at 8 AM)
    const expiringWFHJob = cron.schedule('0 8 * * *', async () => {
      await this.checkExpiringWFH();
    }, {
      scheduled: false,
      timezone: 'Asia/Kolkata' // Adjust to your timezone
    });

    // Check for expired WFH assignments (runs daily at midnight)
    const expiredWFHJob = cron.schedule('0 0 * * *', async () => {
      await this.checkExpiredWFH();
    }, {
      scheduled: false,
      timezone: 'Asia/Kolkata' // Adjust to your timezone
    });

    // Clean up invalid FCM tokens (runs weekly on Sunday at 2 AM)
    const cleanupTokensJob = cron.schedule('0 2 * * 0', async () => {
      await this.cleanupInvalidFCMTokens();
    }, {
      scheduled: false,
      timezone: 'Asia/Kolkata'
    });

    // Plan today's random spot-check rounds (runs each working day at 9 AM).
    // Also planned once on boot below so a midday restart still gets rounds.
    const planSpotChecksJob = cron.schedule('0 9 * * 1-6', async () => {
      await this.planSpotChecks();
    }, {
      scheduled: false,
      timezone: 'Asia/Kolkata'
    });

    // Close expired spot-check windows + compute miss/proxy flags (every 5 min).
    const evaluateSpotChecksJob = cron.schedule('*/5 * * * *', async () => {
      await this.evaluateSpotChecks();
    }, {
      scheduled: false,
      timezone: 'Asia/Kolkata'
    });

    // Flag unapproved absences at the end of the check-in window (working days).
    const absenceHour = parseInt(process.env.ABSENCE_DETECT_HOUR || '11', 10);
    const detectAbsencesJob = cron.schedule(`0 ${absenceHour} * * 1-6`, async () => {
      await this.detectAbsences();
    }, {
      scheduled: false,
      timezone: 'Asia/Kolkata'
    });

    // Pre-class reminders: every minute, push the assigned faculty when one of
    // their timetable slots is about to start (CLASS_REMINDER_LEAD_MIN before).
    const classRemindersJob = cron.schedule('* * * * *', async () => {
      await this.sendClassReminders();
    }, {
      scheduled: false,
      timezone: 'Asia/Kolkata'
    });

    // Missing-log reminders: every 5 min, nudge anyone who finished a class /
    // clinic > buffer ago without logging it (face check + photos).
    const missingLogJob = cron.schedule('*/5 * * * *', async () => {
      await this.sendMissingLogReminders();
    }, {
      scheduled: false,
      timezone: 'Asia/Kolkata'
    });

    // Checkout-compliance analysis: nightly, after the working day is over —
    // finds employees who checked in but never checked out, refreshes the
    // per-employee compliance snapshots and raises/updates red flags
    // (services/checkoutComplianceService.js). Read-only over Attendance.
    const checkoutComplianceJob = cron.schedule('30 21 * * *', async () => {
      await this.runCheckoutCompliance();
    }, {
      scheduled: false,
      timezone: 'Asia/Kolkata'
    });

    this.jobs.push(
      { name: 'expiringWFH', job: expiringWFHJob },
      { name: 'expiredWFH', job: expiredWFHJob },
      { name: 'cleanupTokens', job: cleanupTokensJob },
      { name: 'planSpotChecks', job: planSpotChecksJob },
      { name: 'evaluateSpotChecks', job: evaluateSpotChecksJob },
      { name: 'detectAbsences', job: detectAbsencesJob },
      { name: 'classReminders', job: classRemindersJob },
      { name: 'missingLogReminders', job: missingLogJob },
      { name: 'checkoutCompliance', job: checkoutComplianceJob }
    );

    // Start all jobs
    this.jobs.forEach(({ name, job }) => {
      job.start();
      console.log(`Cron job '${name}' started`);
    });

    // Arm today's spot-check rounds immediately on boot (covers restarts after
    // the 9 AM planning cron has already fired).
    this.planSpotChecks().catch((e) =>
      console.error('Initial spot-check planning failed:', e.message)
    );
  }

  stop() {
    console.log('Stopping cron jobs...');
    this.jobs.forEach(({ name, job }) => {
      job.stop();
      console.log(`Cron job '${name}' stopped`);
    });
  }

  async checkExpiringWFH() {
    try {
      console.log('Checking for expiring WFH assignments...');
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);

      // Find students with WFH assignments expiring tomorrow
      const studentsWithExpiringWFH = await Student.find({
        'wfhAssignments': {
          $elemMatch: {
            isActive: true,
            endDate: {
              $gte: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate()),
              $lt: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate() + 1)
            }
          }
        }
      }).select('_id fullName wfhAssignments');

      if (studentsWithExpiringWFH.length > 0) {
        console.log(`Found ${studentsWithExpiringWFH.length} students with expiring WFH`);
        
        const studentIds = studentsWithExpiringWFH.map(s => s._id);
        const expirationDate = tomorrow.toISOString().split('T')[0];
        
        await pushNotificationService.sendWFHExpiringNotification(studentIds, expirationDate);
      } else {
        console.log('No expiring WFH assignments found');
      }
    } catch (error) {
      console.error('Error checking expiring WFH:', error);
    }
  }

  async checkExpiredWFH() {
    try {
      console.log('Checking for expired WFH assignments...');
      
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Find students with WFH assignments that expired today
      const studentsWithExpiredWFH = await Student.find({
        'wfhAssignments': {
          $elemMatch: {
            isActive: true,
            endDate: { $lt: today }
          }
        }
      }).select('_id fullName wfhAssignments');

      if (studentsWithExpiredWFH.length > 0) {
        console.log(`Found ${studentsWithExpiredWFH.length} students with expired WFH`);
        
        // Deactivate expired assignments
        for (const student of studentsWithExpiredWFH) {
          await Student.updateOne(
            { _id: student._id },
            {
              $set: {
                'wfhAssignments.$[elem].isActive': false
              }
            },
            {
              arrayFilters: [{ 'elem.endDate': { $lt: today }, 'elem.isActive': true }]
            }
          );
        }

        const studentIds = studentsWithExpiredWFH.map(s => s._id);
        await pushNotificationService.sendWFHExpiredNotification(studentIds);
      } else {
        console.log('No expired WFH assignments found');
      }
    } catch (error) {
      console.error('Error checking expired WFH:', error);
    }
  }

  async cleanupInvalidFCMTokens() {
    try {
      console.log('Cleaning up invalid FCM tokens...');
      
      const studentsWithTokens = await Student.find({
        fcmToken: { $exists: true, $ne: null, $ne: '' }
      }).select('_id fcmToken');

      let cleanedCount = 0;
      
      for (const student of studentsWithTokens) {
        const validation = await require('./firebaseService').validateToken(student.fcmToken);

        // Only remove a token when Firebase has CONFIRMED it's dead — an
        // unconfirmed failure (rate limit, transient network/server error)
        // must never delete a real token, or a bad Sunday-2AM sweep can wipe
        // out valid push access for many staff at once.
        if (!validation.valid && validation.confirmed) {
          await Student.findByIdAndUpdate(student._id, {
            $unset: { fcmToken: 1, fcmTokenUpdatedAt: 1 }
          });
          cleanedCount++;
        }
      }

      console.log(`Cleaned up ${cleanedCount} invalid FCM tokens`);
    } catch (error) {
      console.error('Error cleaning up FCM tokens:', error);
    }
  }

  async planSpotChecks() {
    try {
      console.log('Planning spot-check rounds for today...');
      // "HH:MM" -> minutes since midnight. Falls back to the default on any
      // malformed env value instead of crashing the whole planning run.
      const toMinutes = (hhmm, fallbackMinutes) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
        if (!m) return fallbackMinutes;
        return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      };
      // Default: one random round somewhere in 11:00–13:00 (first half of the
      // day), one random round somewhere in 14:25–17:15 (second half) — each
      // window gets its OWN random pick, so the two rounds can never both
      // land in the same half of the day.
      const roundWindows = [
        {
          startMinute: toMinutes(process.env.SPOTCHECK_WINDOW1_START, 11 * 60),
          endMinute: toMinutes(process.env.SPOTCHECK_WINDOW1_END, 13 * 60),
        },
        {
          startMinute: toMinutes(process.env.SPOTCHECK_WINDOW2_START, 14 * 60 + 25),
          endMinute: toMinutes(process.env.SPOTCHECK_WINDOW2_END, 17 * 60 + 15),
        },
      ];
      await spotCheckService.planDailyRounds({
        roundWindows,
        windowMinutes: parseInt(process.env.SPOTCHECK_WINDOW_MINUTES || '15', 10),
      });
    } catch (error) {
      console.error('Error planning spot checks:', error);
    }
  }

  async evaluateSpotChecks() {
    try {
      await spotCheckService.evaluateExpired();
    } catch (error) {
      console.error('Error evaluating spot checks:', error);
    }
  }

  async detectAbsences() {
    try {
      console.log('Detecting unapproved absences...');
      await absenceService.detectAll();
    } catch (error) {
      console.error('Error detecting absences:', error);
    }
  }

  async runCheckoutCompliance() {
    try {
      console.log('Running checkout-compliance analysis...');
      // Lazy require: keeps cronService's boot dependencies unchanged.
      const compliance = require('./checkoutComplianceService');
      const summary = await compliance.runAnalysis({ triggeredBy: 'daily cron' });
      console.log('Checkout-compliance analysis done:', JSON.stringify(summary));
    } catch (error) {
      console.error('Error running checkout-compliance analysis:', error);
    }
  }

  async sendClassReminders() {
    try {
      const lead = parseInt(process.env.CLASS_REMINDER_LEAD_MIN || '10', 10);
      await classReminderService.runDueReminders(lead);
    } catch (error) {
      console.error('Error sending class reminders:', error);
    }
  }

  async sendMissingLogReminders() {
    try {
      const buf = parseInt(process.env.ACTIVITY_LOG_BUFFER_MIN || '30', 10);
      await activityLogReminderService.runMissingLogReminders(buf);
    } catch (error) {
      console.error('Error sending missing-log reminders:', error);
    }
  }

  // Manual trigger methods for testing
  async triggerExpiringWFHCheck() {
    console.log('Manually triggering expiring WFH check...');
    await this.checkExpiringWFH();
  }

  async triggerExpiredWFHCheck() {
    console.log('Manually triggering expired WFH check...');
    await this.checkExpiredWFH();
  }

  async triggerTokenCleanup() {
    console.log('Manually triggering token cleanup...');
    await this.cleanupInvalidFCMTokens();
  }
}

module.exports = new CronService();