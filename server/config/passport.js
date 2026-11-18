const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const { Strategy: JwtStrategy, ExtractJwt } = require("passport-jwt");

const Student = require("../models/Student");
const sessionService = require("../services/sessionService");
require("dotenv").config();

passport.use(
  new LocalStrategy(
    {
      usernameField: "uid",
      passwordField: "password",
      passReqToCallback: true,
    }, // no password
    async (req, uid, password, done) => {
      try {
        const student = await Student.findOne({ uid });
        if (!student) {
          return done(null, false, { message: "User not found" });
        }
        return done(null, student);
      } catch (err) {
        console.log(err, "error from passport config");
        return done(err);
      }
    }
  )
);
passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    },
    async (jwt_payload, done) => {
      try {
        const student = await Student.findById(jwt_payload.id);
        if (!student) return done(null, false);
        // Concurrent-session cap (2 devices): a token whose sid was terminated
        // by a newer login on a 3rd device must be rejected here too — routes
        // guarded by passport (leave/field requests, etc.) share the same cap
        // as the custom `auth` middleware (server/middleware/auth.js).
        if (jwt_payload.sid) {
          const sessionErr = await sessionService.requireActiveSession(jwt_payload);
          if (sessionErr) return done(null, false, sessionErr);
        }
        return done(null, student);
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

module.exports = passport;
