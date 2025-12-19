import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../model/userSchema.js";
import dotenv from "dotenv";

dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3056/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let email = profile.emails?.[0]?.value;

        let user = await User.findOne({
          $or: [{ googleId: profile.id }, { email }],
        });

        if (user) {
          if (user.isBlocked) {
            return done(null, false, { message: "blocked" });
          }

          return done(null, user);
        }

        user = new User({
          name: profile.displayName,
          email,
          googleId: profile.id,
        });
        await user.save();

        return done(null, user);

      } catch (error) {
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);

    if (!user) return done(null, false);

    if (user.isBlocked) {
      return done(null, false);  
    }

    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
});


export default passport;
